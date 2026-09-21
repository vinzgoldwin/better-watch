import { spawn } from 'node:child_process';
import { extname } from 'node:path';
import { realpath } from 'node:fs/promises';
import { MediaQueue } from './media-queue.js';

export const SEGMENT_SECONDS = 8;
const textSubtitles = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);

function mediaCommand(command, args, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let size = 0, stderr = '', failure;
    const timer = setTimeout(() => { failure = new Error('Media conversion timed out'); child.kill('SIGKILL'); }, 90_000);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { failure = new Error('Media output exceeded its limit'); child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(failure || new Error(stderr || 'Media conversion failed'));
      else resolve(Buffer.concat(chunks));
    });
  });
}

export function browserDirect(info, path, audio) {
  const video = info.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const firstAudio = info.streams.find(s => s.codec_type === 'audio');
  return ['.mp4', '.m4v', '.mov'].includes(extname(path).toLowerCase()) &&
    video?.codec_name === 'h264' && ['yuv420p', 'yuvj420p'].includes(video.pix_fmt) &&
    (!firstAudio || (firstAudio.codec_name === 'aac' && firstAudio.channels <= 2 && audio === firstAudio.index));
}

export function vodPlaylist(duration, segmentURL) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`, '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (let i = 0; i < Math.ceil(duration / SEGMENT_SECONDS); i++) {
    // Each requested chunk is independently encoded with its own codec headers.
    if (i) lines.push('#EXT-X-DISCONTINUITY');
    lines.push(`#EXTINF:${Math.min(SEGMENT_SECONDS, duration - i * SEGMENT_SECONDS).toFixed(3)},`, segmentURL(i));
  }
  return lines.concat('#EXT-X-ENDLIST', '').join('\n');
}

// No full-film conversion or disk cache. Seeking encodes only the requested eight
// seconds, one job at a time; at most 64 MiB of recent chunks remain in memory.
export class BrowserPlayback {
  constructor(root, subtitles) {
    this.root = root; this.subtitles = subtitles; this.probes = new Map(); this.cache = new Map();
    this.bytes = 0; this.queue = new MediaQueue();
  }
  async path(movie) {
    const [root, path] = await Promise.all([realpath(this.root), realpath(movie.path)]);
    if (!path.startsWith(root + '/')) throw new Error('Movie is outside the library');
    return path;
  }
  async inspect(movie) {
    if (!this.probes.has(movie.id)) {
      const pending = (async () => {
        const path = await this.path(movie);
        const info = JSON.parse(await mediaCommand('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], 2 * 1024 * 1024));
        const duration = Number(info.format?.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 7 * 24 * 3600 || !info.streams.some(s => s.codec_type === 'video')) throw new Error('Could not read this film’s duration or video track');
        return { ...info, duration };
      })();
      this.probes.set(movie.id, pending);
      pending.catch(() => this.probes.delete(movie.id));
      if (this.probes.size > 64) this.probes.delete(this.probes.keys().next().value);
    }
    return this.probes.get(movie.id);
  }
  audio(info, requested) {
    const tracks = info.streams.filter(s => s.codec_type === 'audio');
    if (requested === null || requested === undefined || requested === '') return tracks.find(s => s.disposition?.default)?.index ?? tracks[0]?.index ?? null;
    const selected = tracks.find(s => s.index === Number(requested));
    if (!selected) throw new Error('Audio track not found');
    return selected.index;
  }
  async descriptor(movie, requested) {
    const info = await this.inspect(movie), audio = this.audio(info, requested);
    const prefix = `/api/playback/${encodeURIComponent(movie.id)}`;
    const external = await this.subtitles.tracks(movie);
    const label = s => [s.tags?.title, s.tags?.language].filter(Boolean).join(' · ') || `Track ${s.index + 1}`;
    return {
      duration: info.duration, audio,
      direct: browserDirect(info, movie.path, audio) ? `/api/stream/${movie.id}` : null,
      hls: `${prefix}/index.m3u8${audio === null ? '' : `?audio=${audio}`}`,
      audioTracks: info.streams.filter(s => s.codec_type === 'audio').map(s => ({ id: s.index, title: label(s) })),
      subtitles: [
        ...info.streams.filter(s => s.codec_type === 'subtitle' && textSubtitles.has(s.codec_name)).map(s => ({ id: String(s.index), title: label(s), language: s.tags?.language || 'und', url: `${prefix}/subtitles/${s.index}.vtt` })),
        ...external.map(s => ({ ...s, id: `external-${s.id}`, url: `${prefix}/subtitles/external-${s.id}.vtt` }))
      ],
      subtitleNotice: info.streams.some(s => s.codec_type === 'subtitle' && !textSubtitles.has(s.codec_name)) ? 'Image subtitles are available in the Mac app; use a text subtitle track here.' : null
    };
  }
  async cached(key, build, signal) {
    if (this.cache.has(key)) {
      const data = this.cache.get(key); this.cache.delete(key); this.cache.set(key, data); return data;
    }
    return this.queue.enqueue(key, async () => {
      const data = await build();
      while (this.bytes + data.length > 64 * 1024 * 1024 && this.cache.size) {
        const oldest = this.cache.keys().next().value;
        this.bytes -= this.cache.get(oldest).length; this.cache.delete(oldest);
      }
      this.cache.set(key, data); this.bytes += data.length;
      return data;
    }, { priority: 1, signal });
  }
  async segment(movie, index, requested, signal) {
    const info = await this.inspect(movie), audio = this.audio(info, requested);
    if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(info.duration / SEGMENT_SECONDS)) throw new Error('Segment not found');
    return this.cached(`${movie.id}:${audio}:${index}`, async () => {
      const path = await this.path(movie);
      const video = info.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
      return mediaCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-ss', String(index * SEGMENT_SECONDS), '-i', path,
        '-t', String(Math.min(SEGMENT_SECONDS, info.duration - index * SEGMENT_SECONDS)), '-map', `0:${video.index}`,
        ...(audio === null ? ['-an'] : ['-map', `0:${audio}`, '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-af', 'asetpts=PTS-STARTPTS', '-frames:a', String(Math.ceil(Math.min(SEGMENT_SECONDS, info.duration - index * SEGMENT_SECONDS) * 48000 / 1024))]),
        '-sn', '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30,setpts=PTS-STARTPTS",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '4M', '-bufsize', '8M', '-pix_fmt', 'yuv420p', '-threads', '2', '-bf', '0', '-g', '60', '-sc_threshold', '0',
        '-f', 'mpegts', '-mpegts_flags', '+initial_discontinuity', '-avoid_negative_ts', 'make_zero', '-output_ts_offset', String(index * SEGMENT_SECONDS), '-muxdelay', '0', 'pipe:1']);
    }, signal);
  }
  async subtitle(movie, track, signal) {
    const info = await this.inspect(movie);
    return this.cached(`${movie.id}:subtitle:${track}`, async () => {
      let path, map = [];
      if (track.startsWith('external-')) {
        const external = await this.subtitles.tracks(movie);
        const found = external.find(s => `external-${s.id}` === track);
        if (!found) throw new Error('Subtitle not found');
        path = await this.subtitles.file(found.id);
      } else {
        const found = info.streams.find(s => String(s.index) === track && s.codec_type === 'subtitle' && textSubtitles.has(s.codec_name));
        if (!found) throw new Error('Subtitle not found');
        path = await this.path(movie); map = ['-map', `0:${found.index}`];
      }
      return mediaCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, ...map, '-f', 'webvtt', 'pipe:1']);
    }, signal);
  }
}
