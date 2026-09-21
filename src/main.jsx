import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MovieBrowser } from './components/movie-browser.jsx';
import { FilmPlayer } from './components/film-player.jsx';
import { useSharedProfile } from './lib/profile-client.js';
import { relativeMovieFolder } from './lib/gallery.js';
import { createRoot } from 'react-dom/client';
import {
  Circle,
  Folder,
  Menu,
  X,
  CheckCircle,
  Clock,
  Grid2X2,
  Heart,
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
import { enrichMoviesWithArtists } from './lib/artists.js';
import { buildSubfolderOptions, movieMatchesSubfolder } from './lib/folders.js';
import { compareReleaseDates } from './lib/release-date.js';
import { FolderPicker } from './components/folder-picker.jsx';
import { CategoryPicker } from './components/category-picker.jsx';
import { buildCategoryOptions, matchesCategories } from './lib/categories.js';

const SIDECAR_CLEANUP_CONFIRMATION = 'remove-appledouble-sidecars';
const MARK_TYPES = [
  { key: 'favorite', label: 'Favorite', Icon: Heart },
  { key: 'watchLater', label: 'Watch Later', Icon: Clock },
  { key: 'watched', label: 'Watched', Icon: CheckCircle }
];

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
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [activeMarkFilter, setActiveMarkFilter] = useState('all');
  const [sortValue, setSortValue] = useState('name');
  const [search, setSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const [artistSort, setArtistSort] = useState('name');
  const [artistList, setArtistList] = useState('all');
  const profile = useSharedProfile();
  const movieMarks = profile.marks, artistMarks = profile.artistMarks;
  const [playing, setPlaying] = useState(null);
  const drawerRef = useRef(null);
  const [libraryError, setLibraryError] = useState('');
  const [cleanupStatus, setCleanupStatus] = useState('');
  const [scanError, setScanError] = useState('');
  const scanFolder = activeSubfolder !== 'All Subfolders' ? activeSubfolder : activeFolder !== 'All Films' ? activeFolder : '';
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [deletingMovieId, setDeletingMovieId] = useState(null);


  const movies = useMemo(() => enrichMoviesWithArtists(library.movies), [library.movies]);

  const refreshLibrary = useCallback(async () => {
    const response = await fetch('/api/library');
    if (!response.ok) throw new Error('Could not load your library. Check Tailscale and reconnect.');
    const nextLibrary = await response.json();
    setLibrary(nextLibrary); setLibraryError('');
  }, []);

  useEffect(() => {
    refreshLibrary().catch(error => setLibraryError(error.message));
  }, [refreshLibrary]);

  useEffect(() => {
    if (!library.scanning) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const response = await fetch('/api/library/status', { signal: controller.signal });
        if (!response.ok) throw new Error('Could not check scan status.');
        const status = await response.json();
        if (!status.scanning) {
          const result = await fetch('/api/library', { signal: controller.signal });
          if (!result.ok) throw new Error('Could not refresh the library.');
          const next = await result.json();
          if (controller.signal.aborted) return;
          setLibrary(next);
          if (!next.scanning) return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setScanError(error.message);
      }
      timer = window.setTimeout(poll, 2500);
    }
    timer = window.setTimeout(poll, 700);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [library.scanning]);

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 960px)');
    const close = () => { if (wide.matches) drawerRef.current?.close(); };
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, []);

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

  const subfolderOptions = useMemo(
    () => buildSubfolderOptions(library.directories || [], movies, activeFolder).map((option) => ({ ...option, label: option.value === 'All Subfolders' ? option.label : relativeMovieFolder(option.value, activeFolder).split('/').join(' / ') })),
    [activeFolder, library.directories, movies]
  );

  useEffect(() => {
    if (!subfolderOptions.some((option) => option.value === activeSubfolder)) {
      setActiveSubfolder('All Subfolders');
    }
  }, [activeSubfolder, subfolderOptions]);

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

  const categoryScopeMovies = useMemo(() => {
    const query = search.trim().toLowerCase();

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
      });
  }, [activeArtist, activeFolder, activeMarkFilter, activeSubfolder, movieMarks, movies, search]);

  const categoryOptions = useMemo(() => buildCategoryOptions(categoryScopeMovies), [categoryScopeMovies]);

  const filteredMovies = useMemo(() => {
    const selected = selectedCategories.map((category) => category.value);
    const direction = sortValue === 'modified' ? -1 : 1;
    return categoryScopeMovies.filter((movie) => matchesCategories(movie, selected))
      .toSorted((a, b) => {
        if (sortValue === 'releaseNewest' || sortValue === 'releaseOldest') return compareReleaseDates(a, b, sortValue === 'releaseOldest');
        if (sortValue === 'duration') return (b.duration || 0) - (a.duration || 0);
        if (sortValue === 'size') return (b.size || 0) - (a.size || 0);
        if (sortValue === 'modified') return direction * ((a.modified || 0) - (b.modified || 0));
        if (sortValue === 'folder') return a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title);
        return a.title.localeCompare(b.title);
      });
  }, [categoryScopeMovies, selectedCategories, sortValue]);

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
    drawerRef.current?.close();
    setActiveView('movies');
    setSelectedCategories([]);
    setActiveFolder(folder);
    setActiveSubfolder('All Subfolders');
    setActiveArtist('All Artists');
  }

  function toggleMovieMark(movieId, markKey) {
    profile.change('marks', movieId, { [markKey]: !movieMarks[movieId]?.[markKey] }).catch(() => {});
  }

  function toggleArtistFavorite(name) {
    profile.change('artistMarks', name, !artistMarks[name]).catch(() => {});
  }

  function chooseList(value) {
    chooseFolder('All Films'); setActiveMarkFilter(value); setSearch('');
  }

  async function deleteMovie(movie) {
    if (!window.confirm(`Permanently delete this video from disk?\n\n${movie.path}\n\nThis cannot be undone.`)) return;
    setDeletingMovieId(movie.id);
    try {
      const response = await fetch('/api/movie', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: movie.id, confirm: 'delete-from-disk' })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete the video.');
      setLibrary((current) => ({ ...current, movies: current.movies.filter((item) => item.id !== movie.id) }));
      if (result.warning) window.alert(result.warning);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setDeletingMovieId(null);
    }
  }

  function openMovie(movie) { setPlaying(movie); }

  async function rescanLibrary() {
    setScanError('');
    setLibrary((current) => ({ ...current, scanning: true }));
    try {
      const response = await fetch('/api/rescan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folder: scanFolder })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not start scan.');

    } catch (error) {
      setScanError(error.message);
      setLibrary((current) => ({ ...current, scanning: false }));
    }
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

  const lists = [
    ['all', 'All Films', Grid2X2], ['favorite', 'Favorites', Heart],
    ['watchLater', 'Watch Later', Clock], ['notWatched', 'Unwatched', Circle], ['watched', 'Watched', CheckCircle]
  ];
  const heading = activeView === 'artists' ? 'Artists' : activeArtist !== 'All Artists' ? activeArtist : activeFolder !== 'All Films' ? activeFolder : lists.find(([key]) => key === activeMarkFilter)[1];
  const navigation = <>
    <div className="sidebar-brand">Better Watch</div>
    <nav className="view-switcher" aria-label="Library">
      {lists.map(([value, label, Icon]) => <button key={value} type="button" className={`view-button${activeView === 'movies' && activeFolder === 'All Films' && activeMarkFilter === value ? ' active' : ''}`} onClick={() => chooseList(value)}><Icon aria-hidden="true" />{label}<small>{markCounts[value]}</small></button>)}
      <button type="button" className={`view-button${activeView === 'artists' ? ' active' : ''}`} onClick={() => { setActiveView('artists'); drawerRef.current?.close(); }}><User aria-hidden="true" />Artists</button>
    </nav>
    <nav className="folder-navigation" aria-label="Folders"><h2>Folders</h2>
      {collectionCounts.filter(([folder]) => folder !== 'All Films').map(([folder, count]) => <button type="button" key={folder} className={`view-button${activeView === 'movies' && activeFolder === folder ? ' active' : ''}`} onClick={() => chooseFolder(folder)}><Folder aria-hidden="true" /><span>{folder}</span><small>{count}</small></button>)}
    </nav>
          <details className="sidebar-footer"><summary>Library tools</summary>
            <button className="rescan" type="button" title={scanFolder ? `Rescan ${scanFolder} and its subfolders` : 'Rescan the entire library'} disabled={library.scanning} onClick={rescanLibrary}>
              <RefreshCw aria-hidden="true" />
              {library.scanning ? 'Scanning...' : scanFolder ? 'Rescan Folder' : 'Rescan Library'}
            </button>
            {scanError ? <p className="cleanup-status" role="alert">{scanError}</p> : null}
            <button className="cleanup" type="button" disabled={cleanupBusy} onClick={cleanupSidecars}>
              {cleanupBusy ? <RefreshCw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {cleanupBusy ? 'Cleaning...' : 'Clean Sidecars'}
            </button>
            <button className="cleanup" type="button" onClick={() => {
              const url = URL.createObjectURL(new Blob([JSON.stringify(movieMarks, null, 2)], { type: 'application/json' }));
              const link = document.createElement('a');
              link.href = url;
              link.download = 'better-watch-movie-lists.json';
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}>Export Movie Lists</button>
            <p className="cleanup-status" aria-live="polite">{cleanupStatus}</p>
          </details>

  </>;

  return (
    <>
      <div className="shell" inert={playing ? true : undefined} aria-hidden={playing ? true : undefined}>
        <aside className="sidebar">{navigation}</aside>
        <dialog ref={drawerRef} className="navigation-drawer" aria-label="Library navigation" onClick={event => { if (event.target === event.currentTarget) drawerRef.current.close(); }}>
          <button className="drawer-close" type="button" aria-label="Close navigation" onClick={() => drawerRef.current.close()}><X /></button>
          {navigation}
        </dialog>
        <main className="content">
          <div className="library-heading"><button className="navigation-toggle" type="button" aria-label="Open library navigation" onClick={() => drawerRef.current.showModal()}><Menu /></button><h1>{heading}</h1><span>{activeView === 'movies' ? filteredMovies.length.toLocaleString() + ' films' : filteredArtists.length.toLocaleString() + ' artists'}</span></div>
          {(libraryError || profile.error) && <p className="connection-error" role="alert">{libraryError || profile.error}{libraryError && <button type="button" onClick={() => refreshLibrary().catch(error => setLibraryError(error.message))}>Reconnect</button>}</p>}
          {activeView === 'movies' ? (
            <>
              <header className="toolbar movie-toolbar">
                {activeFolder !== 'All Films' && <div className="collection-location">
                  <FolderPicker value={activeSubfolder} onChange={(value) => {
                    setActiveSubfolder(value);
                    setActiveArtist('All Artists');
                    setSelectedCategories([]);
                  }} options={subfolderOptions} />
                </div>}
                <div className="controls">
                  <label className="search">
                    <span>Search</span>
                    <input value={search} type="search" placeholder="Search films" onChange={(event) => setSearch(event.target.value)} />
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
                      { value: 'modified', label: 'Newest' },
                      { value: 'releaseNewest', label: 'Newest release' },
                      { value: 'releaseOldest', label: 'Oldest release' }
                    ]}
                  />

                  <CategoryPicker value={selectedCategories} onChange={setSelectedCategories} options={categoryOptions} />

                </div>
              </header>

              {activeArtist !== 'All Artists' ? <p className="artist-scope">{activeArtist} <button type="button" onClick={() => setActiveArtist('All Artists')}>Clear artist</button></p> : null}
              <MovieBrowser
                key={JSON.stringify([activeFolder, activeSubfolder, activeArtist, activeMarkFilter, sortValue, search, selectedCategories.map((item) => item.value)])}
                movies={filteredMovies} collection={activeFolder} subfolder={activeSubfolder}
                movieMarks={movieMarks} onToggleMark={toggleMovieMark} onOpen={openMovie} onDelete={deleteMovie}
                openingId={null} deletingId={deletingMovieId} scanning={library.scanning} />
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
                      setSelectedCategories([]);
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
      {playing && <FilmPlayer key={playing.id} movie={playing} onClose={() => { setPlaying(null); requestAnimationFrame(() => document.querySelector(`[data-movie-id="${CSS.escape(playing.id)}"]`)?.focus({ preventScroll: true })); }} />}
    </>
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
              <img loading="lazy" decoding="async" src={`${thumbnail}?quality=cover&width=480`} srcSet={`${thumbnail}?quality=cover&width=480 480w, ${thumbnail}?quality=cover&width=960 960w`} sizes="(max-width: 650px) 45vw, 260px" alt={`${artist.name} preview ${index + 1}`} />
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

createRoot(document.getElementById('root')).render(<App />);
