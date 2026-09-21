import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { BrowserPlayback, browserDirect, vodPlaylist } from '../src/lib/browser-playback.js';
import { PlaybackSubtitles } from '../src/lib/playback-subtitles.js';

const exec = promisify(execFile);

test('mobile streams decode across chunk boundaries and seeks, with audio selection and WebVTT', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bw-mobile-'));
  let server;
  try {
    const root = join(dir, 'library'); await mkdir(join(root, '.better-watch-cache'), { recursive: true });
    const subtitle = join(root, 'sample.en.srt');
    await writeFile(subtitle, '1\n00:00:01,000 --> 00:00:04,000\nAn English subtitle\n\n2\n00:00:09,000 --> 00:00:12,000\nAfter the segment boundary\n');
    const path = join(root, 'sample.mkv');
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-f', 'lavfi', '-i', 'sine=frequency=880', '-i', subtitle,
      '-t', '18', '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:s', '-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'pcm_s16le', '-c:s', 'srt', '-metadata:s:s:0', 'language=eng', path]);
    const direct = join(root, 'direct.mp4');
    await exec('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-sn', direct]);
    const movies = [{ id: 'sample', path, relativePath: 'sample.mkv', title: 'Sample', folder: 'Root', topFolder: 'Root', hasEnglishSub: true }, { id: 'direct', path: direct, relativePath: 'direct.mp4', title: 'Direct', folder: 'Root', topFolder: 'Root', hasEnglishSub: false }];
    await writeFile(join(root, '.better-watch-cache/index.json'), JSON.stringify({ root, generatedAt: 'fixture', movies, directories: [], scanning: false, errors: [] }));
    server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, LIBRARY_ROOT: root, STATE_DIR: join(dir, 'state'), PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; server.stderr.on('data', data => { stderr += data; });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server did not start: ' + stderr)), 10000);
      server.once('exit', () => { clearTimeout(timer); reject(new Error(stderr)); });
      server.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    });
    const get = async path => { const response = await fetch(base + path); assert.equal(response.status, 200, await response.clone().text()); return response; };
    const descriptor = await (await get('/api/playback/sample')).json();
    assert.equal(descriptor.direct, null); assert.equal(descriptor.audioTracks.length, 2);
    assert.ok(descriptor.subtitles.some(track => track.language === 'eng'));
    assert.match(await (await get(descriptor.subtitles[0].url)).text(), /^WEBVTT/);
    const directInfo = await (await get('/api/playback/direct')).json();
    assert.equal(directInfo.direct, '/api/stream/direct');
    const range = await fetch(base + directInfo.direct, { headers: { Range: 'bytes=0-15' } });
    assert.equal(range.status, 206); assert.equal(range.headers.get('content-type'), 'video/mp4');
    const playlist = await (await get(descriptor.hls)).text();
    assert.equal(playlist.match(/#EXTINF/g).length, 3); assert.match(playlist, /#EXTINF:2\.000/);
    assert.match(playlist, /#EXT-X-ENDLIST/);
    // Request the end before the beginning, just as a seek does. Both must decode.
    for (const index of [2, 0, 1]) {
      const output = join(dir, `segment-${index}.ts`);
      await writeFile(output, Buffer.from(await (await get(`/api/playback/sample/${index}.ts?audio=2`)).arrayBuffer()));
      await exec('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']);
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]);
      const probe = JSON.parse(stdout);
      assert.equal(probe.streams[0].codec_name, 'h264');
      assert.equal(probe.streams[1].codec_name, 'aac');
      assert.ok(Math.abs(Number(probe.format.duration) - (index === 2 ? 2 : 8)) < 0.1);
    }
    const { stderr: decodeLog } = await exec('ffmpeg', ['-v', 'warning', '-i', base + descriptor.hls, '-f', 'null', '-']);
    assert.doesNotMatch(decodeLog, /non.?monoton|corrupt|invalid data|error while decoding/i);
    assert.equal((await fetch(base + '/api/playback/sample/99.ts')).status, 400);
    assert.equal((await fetch(base + '/api/playback/sample?audio=99')).status, 400);
    assert.equal((await fetch(base + '/api/playback/missing')).status, 404);
    assert.equal((await fetch(base + '/api/playback/sample/subtitles/99.vtt')).status, 400);

    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const controller = new AbortController();
    const events = await fetch(base + '/api/profile/events', { signal: controller.signal });
    const reader = events.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /"type":"snapshot"/);
    await post('/api/profile/marks/sample', { favorite: true });
    assert.match(new TextDecoder().decode((await reader.read()).value), /"favorite":true/);
    controller.abort();
    await post('/api/profile/positions/sample', { seconds: 7, duration: 18 });
    const profile = await (await get('/api/profile')).json();
    assert.equal(profile.positions.sample.seconds, 7);
    assert.equal(profile.marks.sample.favorite, true);
    assert.equal(JSON.parse(await readFile(join(dir, 'state/profile.json'), 'utf8')).positions.sample.seconds, 7);
  } finally {
    if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
    await rm(dir, { recursive: true, force: true });
  }
});

test('direct play rejects incompatible codec, pixel format, container, or selected audio', () => {
  const info = { streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' }, { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2 }] };
  assert.equal(browserDirect(info, 'film.mp4', 1), true);
  assert.equal(browserDirect(info, 'film.mkv', 1), false);
  assert.equal(browserDirect(info, 'film.mp4', 2), false);
  assert.equal(browserDirect({ streams: [{ ...info.streams[0], pix_fmt: 'yuv420p10le' }] }, 'film.mp4', null), false);
  assert.equal(vodPlaylist(16, n => `${n}.ts`).match(/#EXTINF/g).length, 2);
});
