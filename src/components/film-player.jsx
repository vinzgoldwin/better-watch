import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Maximize, Pause, Play, RotateCcw, RotateCw, Settings2, Volume2, VolumeX } from 'lucide-react';
import { api } from '../lib/profile-client.js';

export function resumeStart(position) {
  return position && position.seconds >= 5 && position.seconds < position.duration - 10 ? position.seconds : 0;
}
const time = value => {
  const seconds = Math.max(0, Math.floor(value || 0));
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function FilmPlayer({ movie, onClose }) {
  const videoRef = useRef(null), frameRef = useRef(null), hlsRef = useRef(null);
  const initial = useRef(0), lastSave = useRef(0), pending = useRef(Promise.resolve());
  const [source, setSource] = useState(null), [audio, setAudio] = useState(null), [subtitle, setSubtitle] = useState('off');
  const [compatible, setCompatible] = useState(false), [error, setError] = useState('');
  const [paused, setPaused] = useState(true), [position, setPosition] = useState(0), [duration, setDuration] = useState(movie.duration || 0);
  const [controls, setControls] = useState(true), [settings, setSettings] = useState(false), [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const hideTimer = useRef(null);

  function save(final = false) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || video.readyState === 0) return;
    if (!final && Date.now() - lastSave.current < 15000) return;
    lastSave.current = Date.now();
    const value = { seconds: video.ended ? 0 : Math.min(video.currentTime, video.duration), duration: video.duration };
    const path = `/api/profile/positions/${encodeURIComponent(movie.id)}`;
    pending.current = pending.current.catch(() => {}).then(() => api(path, value, { keepalive: true })).catch(cause => {
      setError(`Could not save progress: ${cause.message}`);
    });
  }
  function reveal() {
    setControls(true); clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 3000);
  }
  useEffect(() => {
    const controller = new AbortController();
    async function prepare() {
      try {
        const [next, profile] = await Promise.all([
          api(`/api/playback/${encodeURIComponent(movie.id)}`, undefined, { signal: controller.signal }),
          api('/api/profile', undefined, { signal: controller.signal })
        ]);
        initial.current = resumeStart(profile.positions[movie.id]);
        setDuration(next.duration); setAudio(next.audio); setSource(next);
        const english = next.subtitles.find(track => ['eng', 'en'].includes(track.language));
        setSubtitle(english?.id || 'off');
      } catch (cause) { if (!controller.signal.aborted) { setError(cause.message); setLoading(false); } }
    }
    prepare();
    return () => controller.abort();
  }, [movie.id]);

  useEffect(() => {
    if (!source) return;
    const video = videoRef.current;
    let cancelled = false, hls;
    setLoading(true); setError('');
    async function attach() {
      const url = !compatible && source.direct ? source.direct : source.hls;
      if (url === source.direct || video.canPlayType('application/vnd.apple.mpegurl')) video.src = url;
      else {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (!Hls.isSupported()) { setError('This browser cannot play this stream. Try Safari or Chrome.'); setLoading(false); return; }
        hls = new Hls({ maxBufferLength: 16, maxMaxBufferLength: 24, backBufferLength: 8, maxBufferSize: 24 * 1024 * 1024, enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) { setError('Playback interrupted. Check Tailscale and retry.'); setLoading(false); } });
        hls.loadSource(url); hls.attachMedia(video);
      }
    }
    attach().catch(cause => { if (!cancelled) { setError(cause.message); setLoading(false); } });
    return () => { cancelled = true; hls?.destroy(); hlsRef.current = null; video.pause(); video.removeAttribute('src'); video.load(); };
  }, [source, compatible]);

  useEffect(() => {
    const video = videoRef.current;
    for (const track of video.textTracks) track.mode = track.id === subtitle ? 'showing' : 'disabled';
  }, [subtitle, source]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    frameRef.current.focus();
    const hide = () => { if (document.visibilityState === 'hidden') save(true); };
    const unload = () => save(true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', unload);
    return () => {
      clearTimeout(hideTimer.current); document.body.style.overflow = previous;
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', unload);
    };
  }, []);

  useEffect(() => {
    if (paused || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    let lock, cancelled = false;
    navigator.wakeLock.request('screen').then(value => { if (cancelled) value.release(); else lock = value; }).catch(() => {});
    return () => { cancelled = true; lock?.release(); };
  }, [paused]);

  function toggle() {
    const video = videoRef.current;
    if (video.paused) video.play().catch(cause => setError(cause.message)); else video.pause();
    reveal();
  }
  function seek(seconds) { const v = videoRef.current; if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(seconds, v.duration)); reveal(); }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (frameRef.current.requestFullscreen) await frameRef.current.requestFullscreen();
      else videoRef.current.webkitEnterFullscreen?.();
    } catch (cause) { setError(cause.message); }
  }
  async function switchAudio(value) {
    save(true); initial.current = videoRef.current.currentTime;
    try {
      const next = await api(`/api/playback/${encodeURIComponent(movie.id)}?audio=${value}`);
      setAudio(next.audio); setSource(next);
    } catch (cause) { setError(cause.message); }
  }
  function retry() {
    initial.current = videoRef.current.currentTime || initial.current;
    setError(''); setCompatible(true); setSource({ ...source });
  }
  function close() { save(true); videoRef.current.pause(); onClose(); }
  const visible = controls || paused || settings || Boolean(error) || loading;
  return <section className={`film-player${visible ? ' controls-visible' : ''}`} ref={frameRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={movie.title}
    onPointerMove={event => { if (event.pointerType === 'mouse') reveal(); }} onKeyDown={event => {
      if (event.key === 'Escape' && !document.fullscreenElement) { close(); return; }
      if (event.target.closest('input,select,button')) return;
      if (event.code === 'Space') { event.preventDefault(); toggle(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); seek(videoRef.current.currentTime - 5); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); seek(videoRef.current.currentTime + 5); }
      else if (event.key.toLowerCase() === 'f') fullscreen();
    }}>
    <video ref={videoRef} playsInline preload="metadata" onClick={() => visible ? setControls(false) : reveal()}
      onLoadedMetadata={() => {
        const video = videoRef.current;
        if (initial.current > 0) video.currentTime = initial.current;
        initial.current = 0; setDuration(video.duration);
        video.play().catch(() => { setPaused(true); setControls(true); setLoading(false); });
      }} onTimeUpdate={() => { setPosition(videoRef.current.currentTime); save(); }}
      onPlay={() => { setPaused(false); reveal(); hlsRef.current?.startLoad(-1); }}
      onPause={() => { setPaused(true); save(true); hlsRef.current?.stopLoad(); }}
      onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)}
      onSeeked={() => { setLoading(false); save(true); }} onEnded={() => { setPaused(true); save(true); }}
      onError={() => { if (source?.direct && !compatible) { initial.current = videoRef.current.currentTime || initial.current; setCompatible(true); } else { setError('Could not play this film. Check Tailscale and retry.'); setLoading(false); } }}>
      {source?.subtitles.map(track => <track key={track.id} id={track.id} kind="subtitles" label={track.title} srcLang={track.language === 'eng' ? 'en' : track.language} src={track.url} onLoad={() => {
        for (const item of videoRef.current.textTracks) item.mode = item.id === subtitle ? 'showing' : 'disabled';
      }} />)}
    </video>
    <div className="player-top"><button type="button" onClick={close} aria-label="Back to library"><ArrowLeft /></button><span>{movie.title}</span></div>
    {loading && !error && <p className="player-message" role="status">Preparing playback…</p>}
    {error && <div className="player-message" role="alert"><p>{error}</p>{source && <button type="button" onClick={retry}>Retry playback</button>}</div>}
    <div className="player-controls">
      {settings && <div className="player-settings">
        <label>Audio<select value={audio ?? ''} onChange={event => switchAudio(event.target.value)} disabled={!source?.audioTracks.length}>{source?.audioTracks.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label>
        <label>Subtitles<select value={subtitle} onChange={event => setSubtitle(event.target.value)}><option value="off">Off</option>{source?.subtitles.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label>
        {source?.subtitleNotice && <p>{source.subtitleNotice}</p>}
      </div>}
      <input aria-label="Playback position" className="player-timeline" type="range" min="0" max={duration || 1} step="0.1" value={position} onChange={event => seek(Number(event.target.value))} />
      <div className="player-buttons">
        <button type="button" onClick={toggle} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play /> : <Pause />}</button>
        <button type="button" onClick={() => seek(position - 10)} aria-label="Back 10 seconds"><RotateCcw /><small>10</small></button>
        <button type="button" onClick={() => seek(position + 10)} aria-label="Forward 10 seconds"><RotateCw /><small>10</small></button>
        <button className="mute-button" type="button" onClick={() => { videoRef.current.muted = !muted; setMuted(!muted); }} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <VolumeX /> : <Volume2 />}</button>
        <span className="player-time">{time(position)} / {time(duration)}</span>
        <button type="button" aria-label="Audio and subtitles" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 /></button>
        <button type="button" aria-label="Fullscreen" onClick={fullscreen}><Maximize /></button>
      </div>
    </div>
  </section>;
}
