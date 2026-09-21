import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, Clock, Heart, Play, Trash2, X } from 'lucide-react';
import { PREVIEW_MOMENTS, previewStart, relativeMovieFolder } from '../lib/gallery.js';
import { formatReleaseDate } from '../lib/release-date.js';

const PAGE_SIZE = 24;
const marks = [{ key: 'favorite', label: 'Favorite', Icon: Heart }, { key: 'watchLater', label: 'Watch Later', Icon: Clock }, { key: 'watched', label: 'Watched', Icon: CheckCircle }];
const durationLabel = (seconds) => seconds ? `${Math.floor(seconds / 60)}m` : 'Unknown duration';
const timestamp = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function MovieBrowser({ movies, collection, subfolder, movieMarks, onToggleMark, onOpen, onDelete, openingId, deletingId, scanning }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState(null);
  const sentinelRef = useRef(null);
  const visible = movies.slice(0, limit);
  const selectedIndex = visible.findIndex((movie) => movie.id === selectedId);
  useEffect(() => {
    if (limit >= movies.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => Math.min(current + PAGE_SIZE, movies.length));
    }, { rootMargin: '600px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [limit, movies.length]);

  function close() {
    setSelectedId(null);
  }

  return <>
    <section className="movie-grid" aria-label="Movies">
      {visible.map((movie) => <button key={movie.id}
          type="button" data-movie-id={movie.id} className="movie-tile" aria-expanded={selectedId === movie.id}
          aria-controls={selectedId === movie.id ? 'movie-preview' : undefined} onClick={() => setSelectedId(movie.id)}>
          <span className="movie-cover">
            {movie.thumbnail ? <img loading="lazy" decoding="async" src={`${movie.thumbnail}?quality=cover&width=480`} srcSet={`${movie.thumbnail}?quality=cover&width=480 480w, ${movie.thumbnail}?quality=cover&width=960 960w`} sizes="(max-width: 650px) calc((100vw - 42px) / 2), (max-width: 1050px) calc((100vw - 92px) / 3), (min-width: 1800px) 422px, calc((100vw - 110px) / 4)" alt="" /> : <span className="cover-missing">No preview</span>}
            <span className="cover-duration">{durationLabel(movie.duration)}</span>
            {movie.hasEnglishSub && <span className="cover-subtitle">English Sub</span>}
            {movieMarks[movie.id]?.watched && <span className="cover-watched" aria-label="Watched"><CheckCircle aria-hidden="true" /></span>}
          </span>
          <span className="movie-title">{movie.title || movie.relativePath}</span>
          <span className="movie-caption">{[relativeMovieFolder(movie.folder, collection, subfolder), movie.releaseDate?.slice(0, 4)].filter(Boolean).join(' · ')}</span>
        </button>)}
      {!movies.length && <div className="empty">{scanning ? 'Indexing movies...' : 'No films match this view.'}</div>}
    </section>
    {selectedIndex >= 0 && <MoviePreview key={selectedId} movie={visible[selectedIndex]} marks={movieMarks[selectedId] || {}}
          folder={relativeMovieFolder(visible[selectedIndex].folder, collection, subfolder)}
          onClose={close} onOpen={() => { const movie = visible[selectedIndex]; close(); onOpen(movie); }} onDelete={() => onDelete(visible[selectedIndex])}
          onToggleMark={(key) => onToggleMark(selectedId, key)} opening={openingId === selectedId}
          deleting={deletingId === selectedId} deleteDisabled={scanning || deletingId !== null}
          />}
    {limit < movies.length && <div className="movie-sentinel" ref={sentinelRef} aria-hidden="true" />}
  </>;
}

function MoviePreview({ movie, marks: movieMarks, folder, onClose, onOpen, onDelete, onToggleMark, opening, deleting, deleteDisabled }) {
  const [moment, setMoment] = useState(0);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const attachVideo = useCallback((video) => {
    videoRef.current = video;
    if (video) video.volume = 0.4;
  }, []);
  const dialogRef = useRef(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  const previews = useRef(new Map());
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) videoRef.current?.pause();
    });
    if (videoRef.current) observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [preview]);

  function chooseMoment(value) {
    if (value === moment) return;
    setPreview(null);
    setMoment(value);
  }

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setPreview(null);
    if (previews.current.has(moment)) {
      setPreview(previews.current.get(moment));
      setBusy(false);
      return () => controller.abort();
    }
    setBusy(true);
    async function loadPreview() {
      try {
        const response = await fetch('/api/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: movie.id, moment }), signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.preview) throw new Error(result.error || 'Could not prepare preview.');
        if (controller.signal.aborted) return;
        previews.current.set(moment, result.preview);
        setPreview(result.preview);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    loadPreview();
    return () => controller.abort();
  }, [movie.id, moment]);

  useEffect(() => {
    function handleArrow(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target;
      // Leave editable fields and filter widgets to their own keyboard controls.
      if (target.closest?.('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return;
      if (target !== document.body && !target.closest?.('#movie-preview, [aria-controls="movie-preview"]')) return;
      event.preventDefault();
      setPreview(null);
      setMoment((current) => (current + (event.key === 'ArrowRight' ? 1 : PREVIEW_MOMENTS.length - 1)) % PREVIEW_MOMENTS.length);
    }
    window.addEventListener('keydown', handleArrow);
    return () => window.removeEventListener('keydown', handleArrow);
  }, []);

  return createPortal(<dialog ref={dialogRef} id="movie-preview" className="movie-dialog" aria-labelledby="preview-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <div className="movie-expanded">
    <button className="preview-collapse" type="button" onClick={onClose} autoFocus aria-label="Close preview"><X aria-hidden="true" /> Close</button>
    <div className="preview-visual">
      <div className="preview-screen" style={{ '--moment-position': `${moment * 50}%` }}>
        {preview ? <video key={preview} ref={attachVideo} src={preview} playsInline autoPlay controls preload="metadata" onError={() => { setPreview(null); setError('Preview could not be played.'); }} />
          : movie.thumbnail ? <img src={`${movie.thumbnail}?quality=hd`} alt={`${movie.title} sampled frame`} /> : <span className="cover-missing">No preview</span>}
      </div>
      {busy && <p className="preview-loading" role="status">Preparing preview...</p>}
      <div className="preview-moments" aria-label="Preview moment" aria-keyshortcuts="ArrowLeft ArrowRight">
        {PREVIEW_MOMENTS.map((fraction, index) => <button key={fraction} type="button" aria-pressed={moment === index} onClick={() => chooseMoment(index)}>{timestamp(previewStart(movie.duration, index))}</button>)}
      </div>
    </div>
    <div className="preview-info">
      <h2 id="preview-title">{(movie.title || movie.relativePath).replace(/\s*\[HD\]\s*$/i, '')}</h2>
      <div className="preview-metadata">
        <p className="preview-meta">{[movie.releaseDate?.slice(0, 4), durationLabel(movie.duration), movie.height ? `${movie.height}p` : movie.extension].filter(Boolean).join(' · ')}</p>
        {folder && <p className="preview-folder">{folder.split('/').join(' / ')}</p>}
        {movie.categories?.length > 0 && <ul className="preview-categories" aria-label="Categories">{movie.categories.map((category) => <li key={category}>{category}</li>)}</ul>}
      </div>
      <div className="preview-actions">
        <button className="play-movie" type="button" onClick={onOpen} disabled={opening}><Play aria-hidden="true" />{opening ? 'Opening...' : 'Play'}</button>
      </div>
      <div className="preview-marks" aria-label="Movie lists">{marks.map(({ key, label, Icon }) => <button key={key} type="button" aria-label={label} title={label} aria-pressed={Boolean(movieMarks[key])} onClick={() => onToggleMark(key)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>
      {movie.description?.trim() && <details className="preview-description" open><summary>Description</summary><p>{movie.description}</p></details>}
      <details className="preview-file"><summary>File details</summary><p>{[movie.releaseDate && formatReleaseDate(movie.releaseDate), movie.size >= 1073741824 ? `${(movie.size / 1073741824).toFixed(1)} GB` : `${Math.round(movie.size / 1048576)} MB`].filter(Boolean).join(' · ')}</p><p>{movie.relativePath}</p><button className="delete-movie" type="button" onClick={onDelete} disabled={deleteDisabled}><Trash2 aria-hidden="true" />{deleting ? 'Deleting...' : 'Delete from disk'}</button></details>
      {error && <p role="alert" className="preview-error">{error}</p>}
    </div>
    </div>
  </dialog>, document.body);
}
