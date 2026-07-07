import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CheckCircle,
  Clock,
  Film,
  Folder,
  Grid2X2,
  Heart,
  Info,
  Play,
  RefreshCw,
  Star,
  Trash2,
  User
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select.jsx';

const MARKS_KEY = 'ultra-touch-gallery:movie-marks';
const ARTIST_MARKS_KEY = 'ultra-touch-gallery:artist-marks';
const SIDECAR_CLEANUP_CONFIRMATION = 'remove-appledouble-sidecars';
const HOVER_PREVIEW_DELAY_MS = 300;

const MARK_TYPES = [
  { key: 'favorite', label: 'Favorite', Icon: Heart },
  { key: 'watchLater', label: 'Watch Later', Icon: Clock },
  { key: 'watched', label: 'Watched', Icon: CheckCircle }
];

const NON_ARTIST_FOLDERS = new Set([
  'AT',
  'Pure Taboo',
  'Zero Tolerance',
  'Gold Digger',
  'digital playground',
  'homewreck',
  'seduction',
  'taboo',
  'xxxsmall',
  'babysitter',
  'breed',
  'cheat',
  'ebony',
  'fp',
  'ginger',
  'Hijab',
  'missa',
  'stepsibling',
  'tame brat',
  'xxxtrasmall',
  'ol',
  'Photos (2)'
]);

function readStoredObject(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatSize(bytes) {
  if (!bytes) return 'Unknown';
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function formatResolution(movie) {
  if (!movie.width || !movie.height) return movie.extension || 'Video';
  return `${movie.height}p`;
}

function titleCaseFromToken(token) {
  return token
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^a-zA-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function looksLikeArtistName(name) {
  if (!name || NON_ARTIST_FOLDERS.has(name)) return false;
  const words = name.split(/\s+/);
  return words.length >= 2 && words.length <= 3 && words.every((word) => /^[A-Z][a-z]+$/.test(word));
}

function inferArtists(movie) {
  const artists = new Set();
  const folders = movie.folder.split('/');

  for (const folder of folders) {
    if (looksLikeArtistName(folder)) artists.add(folder);
  }

  const fileName = movie.relativePath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
  const parts = fileName.split(/[_-]+/);
  const sceneIndex = parts.findIndex((part) => /^s\d+$/i.test(part));
  if (sceneIndex >= 0) {
    for (const part of parts.slice(sceneIndex + 1)) {
      if (/^(720p|1080p|2160p|4k|h264|h265|x264|x265)$/i.test(part)) break;
      const name = titleCaseFromToken(part);
      if (looksLikeArtistName(name)) artists.add(name);
    }
  }

  return [...artists].sort((a, b) => a.localeCompare(b));
}

function movieArtists(movie) {
  return movie.artists || inferArtists(movie);
}

function directSubfolderValue(folderPath, activeFolder) {
  const parts = folderPath.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (activeFolder === 'All Films') return parts[0];
  if (parts[0] !== activeFolder || parts.length < 2) return null;
  return `${activeFolder}/${parts[1]}`;
}

function subfolderLabel(value) {
  return value.split('/').pop() || value;
}

function movieMatchesSubfolder(movie, activeSubfolder) {
  return activeSubfolder === 'All Subfolders' || movie.folder === activeSubfolder || movie.folder.startsWith(`${activeSubfolder}/`);
}

function SelectField({ label, value, options, onChange, className }) {
  return (
    <div className={`select ${className || ''}`.trim()}>
      <span>{label}</span>
      <Select items={options} value={value} onValueChange={onChange}>
        <SelectTrigger className="app-select-control" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function App() {
  const [library, setLibrary] = useState({ movies: [], directories: [], scanning: false });
  const [activeView, setActiveView] = useState('movies');
  const [activeFolder, setActiveFolder] = useState('All Films');
  const [activeSubfolder, setActiveSubfolder] = useState('All Subfolders');
  const [activeArtist, setActiveArtist] = useState('All Artists');
  const [activeMarkFilter, setActiveMarkFilter] = useState('all');
  const [sortValue, setSortValue] = useState('name');
  const [search, setSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const [artistSort, setArtistSort] = useState('name');
  const [artistList, setArtistList] = useState('all');
  const [movieMarks, setMovieMarks] = useState(() => readStoredObject(MARKS_KEY));
  const [artistMarks, setArtistMarks] = useState(() => readStoredObject(ARTIST_MARKS_KEY));
  const [cleanupStatus, setCleanupStatus] = useState('');
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [openingMovieId, setOpeningMovieId] = useState(null);
  const [descriptionOpenId, setDescriptionOpenId] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const hoverTimer = useRef(null);
  const hoverToken = useRef(0);
  const hoverVideoRef = useRef(null);

  const movies = useMemo(
    () => library.movies.map((movie) => ({ ...movie, artists: movieArtists(movie) })),
    [library.movies]
  );

  const refreshLibrary = useCallback(async () => {
    const response = await fetch('/api/library');
    const nextLibrary = await response.json();
    setLibrary(nextLibrary);
    if (nextLibrary.scanning) {
      window.setTimeout(refreshLibrary, 2500);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    localStorage.setItem(MARKS_KEY, JSON.stringify(movieMarks));
  }, [movieMarks]);

  useEffect(() => {
    localStorage.setItem(ARTIST_MARKS_KEY, JSON.stringify(artistMarks));
  }, [artistMarks]);

  const collectionCounts = useMemo(() => {
    const counts = new Map();
    counts.set('All Films', movies.length);
    for (const movie of movies) {
      counts.set(movie.topFolder, (counts.get(movie.topFolder) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
      if (a[0] === 'All Films') return -1;
      if (b[0] === 'All Films') return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [movies]);

  const subfolderOptions = useMemo(() => {
    const folders = new Map();
    const counts = new Map();

    for (const directory of library.directories || []) {
      const value = directSubfolderValue(directory, activeFolder);
      if (value) folders.set(value, subfolderLabel(value));
    }

    for (const movie of movies) {
      if (activeFolder !== 'All Films' && movie.topFolder !== activeFolder) continue;
      const value = directSubfolderValue(movie.folder, activeFolder);
      if (!value) continue;
      folders.set(value, subfolderLabel(value));
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    const options = [...folders.entries()]
      .map(([value, label]) => ({ value, label: `${label} (${counts.get(value) || 0})` }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [{ value: 'All Subfolders', label: `All Subfolders (${options.length})` }, ...options];
  }, [activeFolder, library.directories, movies]);

  useEffect(() => {
    if (!subfolderOptions.some((option) => option.value === activeSubfolder)) {
      setActiveSubfolder('All Subfolders');
    }
  }, [activeSubfolder, subfolderOptions]);

  const artistOptions = useMemo(() => {
    const counts = new Map();
    counts.set('All Artists', 0);
    counts.set('Unknown Artist', 0);

    for (const movie of movies) {
      if (activeFolder !== 'All Films' && movie.topFolder !== activeFolder) continue;
      if (!movieMatchesSubfolder(movie, activeSubfolder)) continue;
      counts.set('All Artists', counts.get('All Artists') + 1);

      if (!movie.artists.length) {
        counts.set('Unknown Artist', counts.get('Unknown Artist') + 1);
        continue;
      }

      for (const artist of movie.artists) {
        counts.set(artist, (counts.get(artist) || 0) + 1);
      }
    }

    return [...counts.entries()]
      .filter(([artist, count]) => artist === 'All Artists' || count > 0)
      .sort((a, b) => {
        if (a[0] === 'All Artists') return -1;
        if (b[0] === 'All Artists') return 1;
        if (a[0] === 'Unknown Artist') return 1;
        if (b[0] === 'Unknown Artist') return -1;
        return a[0].localeCompare(b[0]);
      })
      .map(([artist, count]) => ({ value: artist, label: `${artist} (${count})` }));
  }, [activeFolder, activeSubfolder, movies]);

  useEffect(() => {
    if (!artistOptions.some((option) => option.value === activeArtist)) {
      setActiveArtist('All Artists');
    }
  }, [activeArtist, artistOptions]);

  const markCounts = useMemo(() => {
    const counts = { all: movies.length, favorite: 0, watchLater: 0, watched: 0, notWatched: 0 };
    for (const movie of movies) {
      const marks = movieMarks[movie.id] || {};
      for (const mark of MARK_TYPES) {
        if (marks[mark.key]) counts[mark.key] += 1;
      }
      if (!marks.watched) counts.notWatched += 1;
    }
    return counts;
  }, [movieMarks, movies]);

  const markOptions = useMemo(() => {
    const labels = {
      all: 'All Lists',
      favorite: 'Favorites',
      watchLater: 'Watch Later',
      watched: 'Watched',
      notWatched: 'Not Watched'
    };

    return ['all', 'favorite', 'watchLater', 'watched', 'notWatched'].map((value) => ({
      value,
      label: `${labels[value]} (${markCounts[value]})`
    }));
  }, [markCounts]);

  const filteredMovies = useMemo(() => {
    const query = search.trim().toLowerCase();
    const direction = sortValue === 'modified' ? -1 : 1;

    return movies
      .filter((movie) => {
        if (activeFolder !== 'All Films' && movie.topFolder !== activeFolder) return false;
        if (!movieMatchesSubfolder(movie, activeSubfolder)) return false;
        const artistMatch =
          activeArtist === 'All Artists' ||
          (activeArtist === 'Unknown Artist' && !movie.artists.length) ||
          movie.artists.includes(activeArtist);
        if (!artistMatch) return false;
        const marks = movieMarks[movie.id] || {};
        const markMatch =
          activeMarkFilter === 'all' ||
          (activeMarkFilter === 'notWatched' ? !marks.watched : Boolean(marks[activeMarkFilter]));
        if (!markMatch) return false;
        if (!query) return true;
        return [movie.title, movie.relativePath, movie.folder].join(' ').toLowerCase().includes(query);
      })
      .toSorted((a, b) => {
        if (sortValue === 'duration') return (b.duration || 0) - (a.duration || 0);
        if (sortValue === 'size') return (b.size || 0) - (a.size || 0);
        if (sortValue === 'modified') return direction * ((a.modified || 0) - (b.modified || 0));
        if (sortValue === 'folder') return a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title);
        return a.title.localeCompare(b.title);
      });
  }, [activeArtist, activeFolder, activeMarkFilter, activeSubfolder, movieMarks, movies, search, sortValue]);

  const artistSummaries = useMemo(() => {
    const summaries = new Map();

    for (const movie of movies) {
      for (const name of movie.artists) {
        if (!summaries.has(name)) {
          summaries.set(name, { name, count: 0, thumbnail: null, thumbnails: [], folders: new Set() });
        }

        const summary = summaries.get(name);
        summary.count += 1;
        summary.folders.add(movie.folder);
        if (!summary.thumbnail && movie.thumbnail) summary.thumbnail = movie.thumbnail;
        if (movie.thumbnail && !summary.thumbnails.includes(movie.thumbnail) && summary.thumbnails.length < 3) {
          summary.thumbnails.push(movie.thumbnail);
        }
      }
    }

    return [...summaries.values()].map((summary) => ({
      ...summary,
      folders: [...summary.folders].sort((a, b) => a.localeCompare(b))
    }));
  }, [movies]);

  const filteredArtists = useMemo(() => {
    const query = artistSearch.trim().toLowerCase();
    return artistSummaries
      .filter((artist) => {
        if (artistList === 'favorite' && !artistMarks[artist.name]) return false;
        return !query || artist.name.toLowerCase().includes(query);
      })
      .toSorted((a, b) => {
        if (artistSort === 'count') return b.count - a.count || a.name.localeCompare(b.name);
        if (artistSort === 'favorite') {
          const favoriteDelta = Number(Boolean(artistMarks[b.name])) - Number(Boolean(artistMarks[a.name]));
          return favoriteDelta || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
      });
  }, [artistMarks, artistSearch, artistSort, artistList, artistSummaries]);

  function chooseFolder(folder) {
    setActiveFolder(folder);
    setActiveSubfolder('All Subfolders');
    setActiveArtist('All Artists');
  }

  function toggleMovieMark(movieId, markKey) {
    setMovieMarks((currentMarks) => {
      const next = { ...currentMarks };
      const marks = { ...(next[movieId] || {}) };
      marks[markKey] = !marks[markKey];
      if (Object.values(marks).some(Boolean)) next[movieId] = marks;
      else delete next[movieId];
      return next;
    });
  }

  function toggleArtistFavorite(name) {
    setArtistMarks((currentMarks) => {
      const next = { ...currentMarks };
      next[name] = !next[name];
      if (!next[name]) delete next[name];
      return next;
    });
  }

  async function openMovie(movie) {
    setOpeningMovieId(movie.id);
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: movie.id })
      });
    } finally {
      setOpeningMovieId(null);
    }
  }

  async function requestPreview(movie, token) {
    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: movie.id })
      });
      const result = await response.json();
      if (!response.ok || !result.preview || token !== hoverToken.current) return;
      setLibrary((current) => ({
        ...current,
        movies: current.movies.map((item) => (item.id === movie.id ? { ...item, preview: result.preview } : item))
      }));
      setHoverPreview((current) => (current?.movie.id === movie.id ? { ...current, preview: result.preview } : current));
    } catch {
      setHoverPreview((current) => (current?.movie.id === movie.id ? { ...current, preview: null } : current));
    }
  }

  function positionHover(event) {
    setHoverPreview((current) => {
      if (!current) return current;
      const width = 360;
      const height = 220;
      const margin = 18;
      let left = event.clientX + margin;
      let top = event.clientY + margin;
      if (left + width > window.innerWidth - margin) left = event.clientX - width - margin;
      if (top + height > window.innerHeight - margin) top = event.clientY - height - margin;
      return { ...current, x: Math.max(margin, left), y: Math.max(margin, top) };
    });
  }

  function showHoverPreview(event, movie) {
    if (!movie.thumbnail) return;
    clearTimeout(hoverTimer.current);
    hoverToken.current += 1;
    const token = hoverToken.current;
    setHoverPreview({ movie, x: event.clientX + 18, y: event.clientY + 18, preview: movie.preview || null });
    positionHover(event);

    if (!movie.preview) {
      hoverTimer.current = window.setTimeout(() => requestPreview(movie, token), HOVER_PREVIEW_DELAY_MS);
    }
  }

  function hideHoverPreview() {
    clearTimeout(hoverTimer.current);
    hoverToken.current += 1;
    hoverVideoRef.current?.pause();
    setHoverPreview(null);
  }

  async function rescanLibrary() {
    setLibrary((current) => ({ ...current, scanning: true }));
    await fetch('/api/rescan', { method: 'POST' });
    window.setTimeout(refreshLibrary, 700);
  }

  async function cleanupSidecars() {
    const approved = window.confirm('Remove AppleDouble ._* sidecar files from the Ultra Touch library? Real video files are not matched.');
    if (!approved) return;

    setCleanupBusy(true);
    setCleanupStatus('');
    try {
      const response = await fetch('/api/sidecars/cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: SIDECAR_CLEANUP_CONFIRMATION })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sidecar cleanup failed');
      const failed = result.failed?.length ? `, ${result.failed.length} failed` : '';
      setCleanupStatus(`Removed ${result.removedCount} sidecar${result.removedCount === 1 ? '' : 's'}${failed}.`);
    } catch (error) {
      setCleanupStatus(error.message);
    } finally {
      setCleanupBusy(false);
    }
  }

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">External Drive</p>
            <h1>Ultra Touch Library</h1>
          </div>

          <nav className="view-switcher" aria-label="Views">
            <button className={`view-button${activeView === 'movies' ? ' active' : ''}`} type="button" onClick={() => setActiveView('movies')}>
              <Grid2X2 aria-hidden="true" />
              Movies
            </button>
            <button className={`view-button${activeView === 'artists' ? ' active' : ''}`} type="button" onClick={() => setActiveView('artists')}>
              <User aria-hidden="true" />
              Artists
            </button>
          </nav>

          <nav className="collections" aria-label="Collections">
            {collectionCounts.map(([folder, count]) => (
              <button key={folder} className={`collection${folder === activeFolder ? ' active' : ''}`} type="button" onClick={() => chooseFolder(folder)}>
                <span>
                  <Folder aria-hidden="true" />
                  {folder}
                </span>
                <small>{count}</small>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button className="rescan" type="button" disabled={library.scanning} onClick={rescanLibrary}>
              <RefreshCw aria-hidden="true" />
              {library.scanning ? 'Scanning...' : 'Rescan Library'}
            </button>
            <button className="cleanup" type="button" disabled={cleanupBusy} onClick={cleanupSidecars}>
              {cleanupBusy ? <RefreshCw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {cleanupBusy ? 'Cleaning...' : 'Clean Sidecars'}
            </button>
            <p className="cleanup-status" aria-live="polite">{cleanupStatus}</p>
          </div>
        </aside>

        <main className="content">
          {activeView === 'movies' ? (
            <>
              <header className="toolbar">
                <div className="controls">
                  <label className="search">
                    <span>Search</span>
                    <input value={search} type="search" placeholder="Title, folder, filename" onChange={(event) => setSearch(event.target.value)} />
                  </label>

                  <SelectField
                    label="Sort"
                    value={sortValue}
                    onChange={setSortValue}
                    options={[
                      { value: 'name', label: 'Name' },
                      { value: 'folder', label: 'Folder' },
                      { value: 'duration', label: 'Duration' },
                      { value: 'size', label: 'Size' },
                      { value: 'modified', label: 'Newest' }
                    ]}
                  />
                  <SelectField label="Subfolder" className="subfolder" value={activeSubfolder} onChange={(value) => {
                    setActiveSubfolder(value);
                    setActiveArtist('All Artists');
                  }} options={subfolderOptions} />
                  <SelectField label="Artist" className="artist-filter" value={activeArtist} onChange={setActiveArtist} options={artistOptions} />
                  <SelectField label="List" className="list-filter" value={activeMarkFilter} onChange={setActiveMarkFilter} options={markOptions} />
                </div>
              </header>

              <section className="grid" aria-live="polite">
                {filteredMovies.length ? filteredMovies.map((movie) => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    marks={movieMarks[movie.id] || {}}
                    isOpening={openingMovieId === movie.id}
                    descriptionOpen={descriptionOpenId === movie.id}
                    onToggleDescription={() => setDescriptionOpenId((current) => (current === movie.id ? null : movie.id))}
                    onToggleMark={(markKey) => toggleMovieMark(movie.id, markKey)}
                    onOpen={() => openMovie(movie)}
                    onHoverStart={showHoverPreview}
                    onHoverMove={positionHover}
                    onHoverEnd={hideHoverPreview}
                  />
                )) : (
                  <div className="empty">{library.scanning ? 'Indexing movies...' : 'No films match this view.'}</div>
                )}
              </section>
            </>
          ) : (
            <section className="artist-view">
              <header className="toolbar artist-toolbar">
                <div className="controls">
                  <label className="search">
                    <span>Search Artists</span>
                    <input value={artistSearch} type="search" placeholder="Artist name" onChange={(event) => setArtistSearch(event.target.value)} />
                  </label>
                  <SelectField
                    label="Sort Artists"
                    value={artistSort}
                    onChange={setArtistSort}
                    options={[
                      { value: 'name', label: 'Name' },
                      { value: 'count', label: 'Most Films' },
                      { value: 'favorite', label: 'Favorites First' }
                    ]}
                  />
                  <SelectField
                    label="List"
                    className="list-filter"
                    value={artistList}
                    onChange={setArtistList}
                    options={[
                      { value: 'all', label: 'All Artists' },
                      { value: 'favorite', label: 'Favorite Artists' }
                    ]}
                  />
                </div>
              </header>

              <section className="artist-grid" aria-live="polite">
                {filteredArtists.length ? filteredArtists.map((artist) => (
                  <ArtistCard
                    key={artist.name}
                    artist={artist}
                    favorite={Boolean(artistMarks[artist.name])}
                    onFavorite={() => toggleArtistFavorite(artist.name)}
                    onOpen={() => {
                      setActiveArtist(artist.name);
                      setActiveView('movies');
                    }}
                  />
                )) : (
                  <div className="empty">No artists match this view.</div>
                )}
              </section>
            </section>
          )}
        </main>
      </div>

      <HoverPreview preview={hoverPreview} videoRef={hoverVideoRef} />
    </>
  );
}

function MovieCard({ movie, marks, isOpening, descriptionOpen, onToggleDescription, onToggleMark, onOpen, onHoverStart, onHoverMove, onHoverEnd }) {
  return (
    <article className="movie">
      <div
        className={`thumb${movie.thumbnail ? '' : ' missing'}`}
        onMouseEnter={(event) => onHoverStart(event, movie)}
        onMouseMove={onHoverMove}
        onMouseLeave={onHoverEnd}
      >
        {movie.thumbnail ? <img src={movie.thumbnail} alt={`${movie.title} preview strip`} /> : null}
        <div className="fallback">No preview</div>
      </div>
      <div className="movie-body">
        <div className="movie-heading">
          <div className="movie-copy">
            <h3>{movie.title || movie.relativePath}</h3>
            <p className="path">{movie.folder}</p>
          </div>
          {movie.description ? (
            <div className={`description-slot${descriptionOpen ? ' open' : ''}`}>
              <button className="description-trigger" type="button" aria-label="Show description" aria-expanded={descriptionOpen} onClick={onToggleDescription}>
                <Info aria-hidden="true" />
              </button>
              <div className="description-popover" role="tooltip">{movie.description}</div>
            </div>
          ) : null}
        </div>
        <div className="marks" aria-label="Movie lists">
          {MARK_TYPES.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`mark${marks[key] ? ' active' : ''}`}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={Boolean(marks[key])}
              onClick={() => onToggleMark(key)}
            >
              <Icon aria-hidden="true" />
            </button>
          ))}
        </div>
        <dl className="meta">
          <div><dd>{formatDuration(movie.duration)}</dd></div>
          <div><dd>{formatResolution(movie)}</dd></div>
          <div><dd>{formatSize(movie.size)}</dd></div>
        </dl>
        <button className="open" type="button" aria-label={isOpening ? 'Opening in IINA' : 'Open in IINA'} title="Open in IINA" disabled={isOpening} onClick={onOpen}>
          {isOpening ? <RefreshCw aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
      </div>
    </article>
  );
}

function ArtistCard({ artist, favorite, onFavorite, onOpen }) {
  const previewImages = artist.thumbnails.length ? artist.thumbnails : [artist.thumbnail].filter(Boolean);

  return (
    <article className="artist-card">
      <button className={`artist-favorite${favorite ? ' active' : ''}`} type="button" aria-label="Favorite artist" aria-pressed={favorite} title={favorite ? 'Unfavorite artist' : 'Favorite artist'} onClick={onFavorite}>
        <Star aria-hidden="true" />
      </button>
      <button className="artist-open" type="button" onClick={onOpen}>
        <div className="artist-thumbs">
          {previewImages.length ? previewImages.map((thumbnail, index) => (
            <div className="artist-thumb" key={thumbnail}>
              <img src={thumbnail} alt={`${artist.name} preview ${index + 1}`} />
            </div>
          )) : (
            <div className="artist-thumb missing">
              <div className="fallback">No preview</div>
            </div>
          )}
        </div>
        <div className="artist-body">
          <h3>{artist.name}</h3>
          <p>{artist.count} {artist.count === 1 ? 'film' : 'films'}</p>
        </div>
      </button>
    </article>
  );
}

function HoverPreview({ preview, videoRef }) {
  if (!preview) return null;

  const style = { left: `${preview.x}px`, top: `${preview.y}px` };

  return (
    <div className={`hover-preview visible${preview.preview ? ' video-preview' : ''}`} aria-hidden="true" style={style}>
      {preview.preview ? (
        <video ref={videoRef} src={preview.preview} poster={preview.movie.thumbnail} muted loop playsInline autoPlay preload="metadata" />
      ) : null}
      <img src={preview.movie.thumbnail} alt="" />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
