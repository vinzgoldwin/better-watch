import React, { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle, Clock, Heart, Play, Trash2, X } from 'lucide-react';
import { PREVIEW_MOMENTS, previewRowEnd, previewStart, relativeMovieFolder } from '../lib/gallery.js';
import { formatReleaseDate } from '../lib/release-date.js';

const PAGE_SIZE = 24;
const marks = [{ key: 'favorite', label: 'Favorite', Icon: Heart }, { key: 'watchLater', label: 'Watch Later', Icon: Clock }, { key: 'watched', label: 'Watched', Icon: CheckCircle }];
const durationLabel = (seconds) => seconds ? `${Math.floor(seconds / 60)}m` : 'Unknown duration';
const timestamp = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function MovieBrowser({ movies, collection, subfolder, movieMarks, onToggleMark, onOpen, onDelete, openingId, deletingId, scanning }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState(null);
  const [columns, setColumns] = useState(4);
  const gridRef = useRef(null);
  const sentinelRef = useRef(null);
  const tileRefs = useRef(new Map());
  const anchor = useRef(null);
  const visible = movies.slice(0, limit);
  const selectedIndex = visible.findIndex((movie) => movie.id === selectedId);
  const rowEnd = previewRowEnd(selectedIndex, columns, visible.length);

  useEffect(() => {
    const grid = gridRef.current;
    const observer = new ResizeObserver(() => setColumns(getComputedStyle(grid).gridTemplateColumns.split(' ').length));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (limit >= movies.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => Math.min(current + PAGE_SIZE, movies.length));
    }, { rootMargin: '600px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [limit, movies.length]);

  // Keep the chosen tile in place when moving a preview from an earlier row.
  useLayoutEffect(() => {
    if (!anchor.current) return;
    const { id, top } = anchor.current;
    const tile = tileRefs.current.get(id);
    if (tile) window.scrollBy(0, tile.getBoundingClientRect().top - top);
    anchor.current = null;
  }, [selectedId]);

  function select(id) {
    const tile = tileRefs.current.get(id);
    if (tile) anchor.current = { id, top: tile.getBoundingClientRect().top };
    setSelectedId((current) => current === id ? null : id);
  }

  function close() {
    select(selectedId);
    tileRefs.current.get(selectedId)?.focus({ preventScroll: true });
  }

  return <>
    <section className="movie-grid" ref={gridRef} aria-label="Movies" onKeyDown={(event) => {
      if (event.key === 'Escape' && selectedId) { event.stopPropagation(); close(); }
    }}>
      {visible.map((movie, index) => <Fragment key={movie.id}>
        <button ref={(node) => { if (node) tileRefs.current.set(movie.id, node); else tileRefs.current.delete(movie.id); }}
          type="button" className="movie-tile" aria-expanded={selectedId === movie.id}
          aria-controls={selectedId === movie.id ? 'movie-preview' : undefined} onClick={() => select(movie.id)}>
          <span className="movie-cover">
            {movie.thumbnail ? <img loading="lazy" decoding="async" src={`${movie.thumbnail}?quality=hd`} alt="" /> : <span className="cover-missing">No preview</span>}
            <span className="cover-duration">{durationLabel(movie.duration)}</span>
            {movie.hasEnglishSub && <span className="cover-subtitle">English Sub</span>}
            {movieMarks[movie.id]?.watched && <span className="cover-watched" aria-label="Watched"><CheckCircle aria-hidden="true" /></span>}
          </span>
          <span className="movie-title">{movie.title || movie.relativePath}</span>
          <span className="movie-caption">{[relativeMovieFolder(movie.folder, collection, subfolder), movie.releaseDate?.slice(0, 4)].filter(Boolean).join(' · ')}</span>
        </button>
        {index === rowEnd && <MoviePreview key={selectedId} movie={visible[selectedIndex]} marks={movieMarks[selectedId] || {}}
          folder={relativeMovieFolder(visible[selectedIndex].folder, collection, subfolder)}
          onClose={close} onOpen={() => onOpen(visible[selectedIndex])} onDelete={() => onDelete(visible[selectedIndex])}
          onToggleMark={(key) => onToggleMark(selectedId, key)} opening={openingId === selectedId}
          deleting={deletingId === selectedId} deleteDisabled={scanning || deletingId !== null}
          arrow={`${((selectedIndex % columns) + 0.5) / columns * 100}%`} />}
      </Fragment>)}
      {!movies.length && <div className="empty">{scanning ? 'Indexing movies...' : 'No films match this view.'}</div>}
    </section>
    {limit < movies.length && <div className="movie-sentinel" ref={sentinelRef} aria-hidden="true" />}
  </>;
}

function MoviePreview({ movie, marks: movieMarks, folder, onClose, onOpen, onDelete, onToggleMark, opening, deleting, deleteDisabled, arrow }) {
  const [moment, setMoment] = useState(1);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
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
      // The opening card keeps focus. Also allow arrows inside the preview,
      // but leave filter widgets and editable fields to their own keyboard controls.
      if (target.closest?.('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return;
      if (target !== document.body && !target.closest?.('#movie-preview, [aria-controls="movie-preview"]')) return;
      event.preventDefault();
      setPreview(null);
      setMoment((current) => (current + (event.key === 'ArrowRight' ? 1 : PREVIEW_MOMENTS.length - 1)) % PREVIEW_MOMENTS.length);
    }
    window.addEventListener('keydown', handleArrow);
    return () => window.removeEventListener('keydown', handleArrow);
  }, []);

  return <section id="movie-preview" className="movie-expanded" aria-label={`Preview ${movie.title}`} style={{ '--preview-arrow': arrow }}>
    <button className="preview-collapse" type="button" onClick={onClose} aria-label="Collapse preview"><X aria-hidden="true" /> Collapse</button>
    <div className="preview-visual">
      <div className="preview-screen" style={{ '--moment-position': `${moment * 50}%` }}>
        {preview ? <video key={preview} ref={videoRef} src={preview} muted loop playsInline autoPlay controls preload="metadata" onError={() => { setPreview(null); setError('Preview could not be played.'); }} />
          : movie.thumbnail ? <img src={`${movie.thumbnail}?quality=hd`} alt={`${movie.title} sampled frame`} /> : <span className="cover-missing">No preview</span>}
      </div>
      {busy && <p className="preview-loading" role="status">Preparing preview...</p>}
      <div className="preview-moments" aria-label="Preview moment" aria-keyshortcuts="ArrowLeft ArrowRight">
        {PREVIEW_MOMENTS.map((fraction, index) => <button key={fraction} type="button" aria-pressed={moment === index} onClick={() => chooseMoment(index)}>{timestamp(previewStart(movie.duration, index))}</button>)}
      </div>
    </div>
    <div className="preview-info">
      <h2>{movie.title || movie.relativePath}</h2>
      {folder && <p className="preview-folder">{folder}</p>}
      <p className="preview-meta">{[movie.releaseDate?.slice(0, 4), durationLabel(movie.duration), movie.height ? `${movie.height}p` : movie.extension].filter(Boolean).join(' · ')}</p>
      {movie.categories?.length > 0 && <p className="preview-categories" aria-label="Categories">{movie.categories.join(' · ')}</p>}
      <div className="preview-actions">
        <button className="play-movie" type="button" onClick={onOpen} disabled={opening}><Play aria-hidden="true" />{opening ? 'Opening...' : 'Play in IINA'}</button>
      </div>
      <div className="preview-marks" aria-label="Movie lists">{marks.map(({ key, label, Icon }) => <button key={key} type="button" aria-label={label} title={label} aria-pressed={Boolean(movieMarks[key])} onClick={() => onToggleMark(key)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>
      {movie.description?.trim() && <details className="preview-description" open><summary>Description</summary><p>{movie.description}</p></details>}
      <details className="preview-file"><summary>File details</summary><p>{[movie.releaseDate && formatReleaseDate(movie.releaseDate), movie.size >= 1073741824 ? `${(movie.size / 1073741824).toFixed(1)} GB` : `${Math.round(movie.size / 1048576)} MB`].filter(Boolean).join(' · ')}</p><p>{movie.relativePath}</p><button className="delete-movie" type="button" onClick={onDelete} disabled={deleteDisabled}><Trash2 aria-hidden="true" />{deleting ? 'Deleting...' : 'Delete from disk'}</button></details>
      {error && <p role="alert" className="preview-error">{error}</p>}
    </div>
  </section>;
}
