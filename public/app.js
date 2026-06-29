const collections = document.querySelector('#collections');
const movieGrid = document.querySelector('#movieGrid');
const artistGrid = document.querySelector('#artistGrid');
const template = document.querySelector('#movieTemplate');
const artistTemplate = document.querySelector('#artistTemplate');
const movieToolbar = document.querySelector('#movieToolbar');
const artistView = document.querySelector('#artistView');
const moviesViewButton = document.querySelector('#moviesViewButton');
const artistsViewButton = document.querySelector('#artistsViewButton');
const searchInput = document.querySelector('#searchInput');
const sortSelect = document.querySelector('#sortSelect');
const subfolderSelect = document.querySelector('#subfolderSelect');
const artistSelect = document.querySelector('#artistSelect');
const markFilterSelect = document.querySelector('#markFilterSelect');
const artistSearchInput = document.querySelector('#artistSearchInput');
const artistSortSelect = document.querySelector('#artistSortSelect');
const artistListSelect = document.querySelector('#artistListSelect');
const filterSelects = [
  sortSelect,
  subfolderSelect,
  artistSelect,
  markFilterSelect,
  artistSortSelect,
  artistListSelect
];
const rescanButton = document.querySelector('#rescanButton');
const hoverPreview = document.querySelector('#hoverPreview');
const hoverPreviewImage = hoverPreview.querySelector('img');

const MARKS_KEY = 'ultra-touch-gallery:movie-marks';
const ARTIST_MARKS_KEY = 'ultra-touch-gallery:artist-marks';
const MARK_TYPES = [
  { key: 'favorite', label: 'Favorite', icon: 'heart' },
  { key: 'watchLater', label: 'Watch Later', icon: 'clock' },
  { key: 'watched', label: 'Watched', icon: 'checkCircle' }
];

const ICONS = {
  checkCircle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12.25 11.1 14.35 15.5 9.95"/><circle cx="12" cy="12" r="8.25"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25"/><path d="M12 7.75v4.75l3.1 1.85"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.25s-7.25-4.35-7.25-9.3A4.05 4.05 0 0 1 12 7.45a4.05 4.05 0 0 1 7.25 2.5c0 4.95-7.25 9.3-7.25 9.3Z"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25"/><path d="M12 10.1v5.2"/><path d="M12 7.6h.01"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.25 7.5 7.25 4.5-7.25 4.5Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.15 8.45A6.35 6.35 0 0 1 18.35 11"/><path d="M18.35 6.7V11h-4.3"/><path d="M16.85 15.55A6.35 6.35 0 0 1 5.65 13"/><path d="M5.65 17.3V13h4.3"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4.75 2.18 4.42 4.87.71-3.52 3.43.83 4.85L12 15.87l-4.36 2.29.83-4.85-3.52-3.43 4.87-.71Z"/></svg>'
};

function iconSvg(name) {
  return ICONS[name] || '';
}

function closeCustomSelects(except) {
  for (const select of filterSelects) {
    const custom = select.nextElementSibling;
    if (custom !== except) custom?.classList.remove('open');
  }
}

function setDescriptionOpen(slot, open) {
  slot.classList.toggle('open', open);
  const button = slot.querySelector('.description-trigger');
  if (button) {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}

function closeDescriptionPopovers(except) {
  for (const slot of document.querySelectorAll('.description-slot.open')) {
    if (slot !== except) setDescriptionOpen(slot, false);
  }
}

function positionCustomSelectMenu(custom) {
  const button = custom.querySelector('.custom-select-button');
  const menu = custom.querySelector('.custom-select-menu');
  menu.classList.remove('align-right');

  if (window.matchMedia('(max-width: 900px)').matches) return;

  const rect = button.getBoundingClientRect();
  const viewportPadding = 12;
  const menuWidth = Math.min(Math.max(rect.width, 240), window.innerWidth - viewportPadding * 2);
  menu.style.setProperty('--select-menu-width', `${menuWidth}px`);

  if (rect.left + menuWidth > window.innerWidth - viewportPadding) {
    menu.classList.add('align-right');
  }
}

function updateCustomSelect(select) {
  const custom = select.nextElementSibling;
  if (!custom?.classList.contains('custom-select')) return;

  const button = custom.querySelector('.custom-select-button');
  const menu = custom.querySelector('.custom-select-menu');
  const selected = select.selectedOptions[0];
  button.textContent = selected?.textContent || '';
  menu.replaceChildren();

  for (const option of select.options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `custom-select-option${option.selected ? ' selected' : ''}`;
    item.textContent = option.textContent;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', option.selected ? 'true' : 'false');
    item.addEventListener('click', () => {
      select.value = option.value;
      closeCustomSelects();
      select.dispatchEvent(new Event('change', { bubbles: true }));
      updateCustomSelect(select);
    });
    menu.append(item);
  }
}

function setupCustomSelects() {
  for (const select of filterSelects) {
    const custom = document.createElement('div');
    custom.className = 'custom-select';
    custom.innerHTML = '<button class="custom-select-button" type="button" aria-haspopup="listbox"></button><div class="custom-select-menu" role="listbox"></div>';
    select.after(custom);

    const button = custom.querySelector('.custom-select-button');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !custom.classList.contains('open');
      closeCustomSelects(custom);
      if (willOpen) positionCustomSelectMenu(custom);
      custom.classList.toggle('open', willOpen);
    });

    updateCustomSelect(select);
  }
}

let library = { movies: [], scanning: false };
let activeView = 'movies';
let activeFolder = 'All Films';
let activeSubfolder = 'All Subfolders';
let activeArtist = 'All Artists';
let activeMarkFilter = 'all';
let movieMarks = loadMarks();
let artistMarks = loadArtistMarks();

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

function loadMarks() {
  try {
    return JSON.parse(localStorage.getItem(MARKS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveMarks() {
  localStorage.setItem(MARKS_KEY, JSON.stringify(movieMarks));
}

function loadArtistMarks() {
  try {
    return JSON.parse(localStorage.getItem(ARTIST_MARKS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveArtistMarks() {
  localStorage.setItem(ARTIST_MARKS_KEY, JSON.stringify(artistMarks));
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
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
  if (!movie.artists) movie.artists = inferArtists(movie);
  return movie.artists;
}

function artistSummaries() {
  const summaries = new Map();

  for (const movie of library.movies) {
    for (const name of movieArtists(movie)) {
      if (!summaries.has(name)) {
        summaries.set(name, {
          name,
          count: 0,
          thumbnail: null,
          thumbnails: [],
          folders: new Set()
        });
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
}

function filteredArtists() {
  const query = artistSearchInput.value.trim().toLowerCase();
  let artists = artistSummaries().filter((artist) => {
    if (artistListSelect.value === 'favorite' && !artistMarks[artist.name]) return false;
    if (!query) return true;
    return artist.name.toLowerCase().includes(query);
  });

  artists = artists.toSorted((a, b) => {
    if (artistSortSelect.value === 'count') return b.count - a.count || a.name.localeCompare(b.name);
    if (artistSortSelect.value === 'favorite') {
      const favoriteDelta = Number(Boolean(artistMarks[b.name])) - Number(Boolean(artistMarks[a.name]));
      return favoriteDelta || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  return artists;
}

function setView(view) {
  activeView = view;
  movieToolbar.hidden = view !== 'movies';
  movieGrid.hidden = view !== 'movies';
  artistView.hidden = view !== 'artists';
  moviesViewButton.classList.toggle('active', view === 'movies');
  artistsViewButton.classList.toggle('active', view === 'artists');
  if (view === 'artists') renderArtistCards();
}

function countByFolder() {
  const counts = new Map();
  counts.set('All Films', library.movies.length);
  for (const movie of library.movies) {
    counts.set(movie.topFolder, (counts.get(movie.topFolder) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    if (a[0] === 'All Films') return -1;
    if (b[0] === 'All Films') return 1;
    return a[0].localeCompare(b[0]);
  });
}

function availableSubfolders() {
  const counts = new Map();
  counts.set('All Subfolders', 0);

  for (const movie of library.movies) {
    if (activeFolder !== 'All Films' && movie.topFolder !== activeFolder) continue;
    counts.set(movie.folder, (counts.get(movie.folder) || 0) + 1);
    counts.set('All Subfolders', counts.get('All Subfolders') + 1);
  }

  return [...counts.entries()].sort((a, b) => {
    if (a[0] === 'All Subfolders') return -1;
    if (b[0] === 'All Subfolders') return 1;
    return a[0].localeCompare(b[0]);
  });
}

function renderSubfolders() {
  const options = availableSubfolders();
  const validValues = new Set(options.map(([folder]) => folder));
  if (!validValues.has(activeSubfolder)) activeSubfolder = 'All Subfolders';

  subfolderSelect.replaceChildren();
  for (const [folder, count] of options) {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder === 'All Subfolders' ? `${folder} (${count})` : `${folder} (${count})`;
    option.selected = folder === activeSubfolder;
    subfolderSelect.append(option);
  }
  updateCustomSelect(subfolderSelect);
}

function availableArtists() {
  const counts = new Map();
  counts.set('All Artists', 0);
  counts.set('Unknown Artist', 0);

  for (const movie of library.movies) {
    if (activeFolder !== 'All Films' && movie.topFolder !== activeFolder) continue;
    if (activeSubfolder !== 'All Subfolders' && movie.folder !== activeSubfolder) continue;
    counts.set('All Artists', counts.get('All Artists') + 1);

    const artists = movieArtists(movie);
    if (!artists.length) {
      counts.set('Unknown Artist', counts.get('Unknown Artist') + 1);
      continue;
    }

    for (const artist of artists) {
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
    });
}

function renderArtists() {
  const options = availableArtists();
  const validValues = new Set(options.map(([artist]) => artist));
  if (!validValues.has(activeArtist)) activeArtist = 'All Artists';

  artistSelect.replaceChildren();
  for (const [artist, count] of options) {
    const option = document.createElement('option');
    option.value = artist;
    option.textContent = `${artist} (${count})`;
    option.selected = artist === activeArtist;
    artistSelect.append(option);
  }
  updateCustomSelect(artistSelect);
}

function countMarks() {
  const counts = { all: library.movies.length, favorite: 0, watchLater: 0, watched: 0, notWatched: 0 };

  for (const movie of library.movies) {
    const marks = movieMarks[movie.id] || {};
    for (const mark of MARK_TYPES) {
      if (marks[mark.key]) counts[mark.key] += 1;
    }
    if (!marks.watched) counts.notWatched += 1;
  }

  return counts;
}

function renderMarkFilter() {
  const counts = countMarks();
  const labels = {
    all: 'All Lists',
    favorite: 'Favorites',
    watchLater: 'Watch Later',
    watched: 'Watched',
    notWatched: 'Not Watched'
  };

  markFilterSelect.replaceChildren();
  for (const value of ['all', 'favorite', 'watchLater', 'watched', 'notWatched']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `${labels[value]} (${counts[value]})`;
    option.selected = value === activeMarkFilter;
    markFilterSelect.append(option);
  }
  updateCustomSelect(markFilterSelect);
}

function renderCollections() {
  collections.replaceChildren();

  for (const [folder, count] of countByFolder()) {
    const button = document.createElement('button');
    button.className = `collection${folder === activeFolder ? ' active' : ''}`;
    button.type = 'button';
    button.innerHTML = `<span>${folder}</span><small>${count}</small>`;
    button.addEventListener('click', () => {
      activeFolder = folder;
      activeSubfolder = 'All Subfolders';
      activeArtist = 'All Artists';
      renderCollections();
      renderSubfolders();
      renderArtists();
      renderMovies();
    });
    collections.append(button);
  }
}

function filteredMovies() {
  const query = searchInput.value.trim().toLowerCase();
  let movies = library.movies.filter((movie) => {
    const folderMatch = activeFolder === 'All Films' || movie.topFolder === activeFolder;
    if (!folderMatch) return false;
    const subfolderMatch = activeSubfolder === 'All Subfolders' || movie.folder === activeSubfolder;
    if (!subfolderMatch) return false;
    const artists = movieArtists(movie);
    const artistMatch =
      activeArtist === 'All Artists' ||
      (activeArtist === 'Unknown Artist' && !artists.length) ||
      artists.includes(activeArtist);
    if (!artistMatch) return false;
    const marks = movieMarks[movie.id] || {};
    const markMatch =
      activeMarkFilter === 'all' ||
      (activeMarkFilter === 'notWatched' ? !marks.watched : Boolean(marks[activeMarkFilter]));
    if (!markMatch) return false;
    if (!query) return true;

    return [movie.title, movie.relativePath, movie.folder]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const direction = sortSelect.value === 'modified' ? -1 : 1;
  movies = movies.toSorted((a, b) => {
    if (sortSelect.value === 'duration') return (b.duration || 0) - (a.duration || 0);
    if (sortSelect.value === 'size') return (b.size || 0) - (a.size || 0);
    if (sortSelect.value === 'modified') return direction * ((a.modified || 0) - (b.modified || 0));
    if (sortSelect.value === 'folder') return a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });

  return movies;
}

function metaItem(value) {
  return `<div><dd>${value}</dd></div>`;
}

function positionHoverPreview(event) {
  const margin = 18;
  const rect = hoverPreview.getBoundingClientRect();
  let left = event.clientX + margin;
  let top = event.clientY + margin;

  if (left + rect.width > window.innerWidth - margin) {
    left = event.clientX - rect.width - margin;
  }
  if (top + rect.height > window.innerHeight - margin) {
    top = event.clientY - rect.height - margin;
  }

  hoverPreview.style.left = `${Math.max(margin, left)}px`;
  hoverPreview.style.top = `${Math.max(margin, top)}px`;
}

function showHoverPreview(event, movie) {
  if (!movie.thumbnail) return;
  hoverPreviewImage.src = movie.thumbnail;
  hoverPreviewImage.alt = `${movie.title} enlarged preview`;
  hoverPreview.classList.add('visible');
  positionHoverPreview(event);
}

function hideHoverPreview() {
  hoverPreview.classList.remove('visible');
}

function renderMarkButtons(container, movie) {
  container.replaceChildren();
  const marks = movieMarks[movie.id] || {};

  for (const mark of MARK_TYPES) {
    const button = document.createElement('button');
    button.className = `mark${marks[mark.key] ? ' active' : ''}`;
    button.type = 'button';
    button.title = mark.label;
    button.setAttribute('aria-label', mark.label);
    button.setAttribute('aria-pressed', marks[mark.key] ? 'true' : 'false');
    button.innerHTML = iconSvg(mark.icon);
    button.addEventListener('click', () => {
      const current = movieMarks[movie.id] || {};
      current[mark.key] = !current[mark.key];
      movieMarks[movie.id] = current;

      if (!Object.values(current).some(Boolean)) {
        delete movieMarks[movie.id];
      }

      saveMarks();
      renderMarkFilter();
      renderMovies();
    });
    container.append(button);
  }
}

function renderArtistCards() {
  const artists = filteredArtists();
  artistGrid.replaceChildren();

  if (!artists.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No artists match this view.';
    artistGrid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const artist of artists) {
    const node = artistTemplate.content.cloneNode(true);
    const card = node.querySelector('.artist-card');
    const favorite = node.querySelector('.artist-favorite');
    const open = node.querySelector('.artist-open');
    const thumbs = node.querySelector('.artist-thumbs');
    const name = node.querySelector('h3');
    const count = node.querySelector('p');

    card.dataset.artist = artist.name;
    favorite.classList.toggle('active', Boolean(artistMarks[artist.name]));
    favorite.setAttribute('aria-pressed', artistMarks[artist.name] ? 'true' : 'false');
    favorite.title = artistMarks[artist.name] ? 'Unfavorite artist' : 'Favorite artist';
    favorite.innerHTML = iconSvg('star');
    name.textContent = artist.name;
    count.textContent = `${artist.count} ${artist.count === 1 ? 'film' : 'films'}`;

    const previewImages = artist.thumbnails.length ? artist.thumbnails : [artist.thumbnail].filter(Boolean);
    if (previewImages.length) {
      for (const [index, thumbnail] of previewImages.entries()) {
        const frame = document.createElement('div');
        frame.className = 'artist-thumb';
        const img = document.createElement('img');
        img.src = thumbnail;
        img.alt = `${artist.name} preview ${index + 1}`;
        frame.append(img);
        thumbs.append(frame);
      }
    } else {
      const frame = document.createElement('div');
      frame.className = 'artist-thumb missing';
      frame.innerHTML = '<div class="fallback">No preview</div>';
      thumbs.append(frame);
    }

    favorite.addEventListener('click', () => {
      artistMarks[artist.name] = !artistMarks[artist.name];
      if (!artistMarks[artist.name]) delete artistMarks[artist.name];
      saveArtistMarks();
      renderArtistCards();
    });

    open.addEventListener('click', () => {
      activeArtist = artist.name;
      renderArtists();
      setView('movies');
      renderMovies();
    });

    fragment.append(node);
  }

  artistGrid.append(fragment);
}

async function openMovie(movie) {
  await fetch('/api/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: movie.id })
  });
}

function renderMovies() {
  const movies = filteredMovies();
  movieGrid.replaceChildren();

  if (!movies.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = library.scanning ? 'Indexing movies...' : 'No films match this view.';
    movieGrid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const movie of movies) {
    const node = template.content.cloneNode(true);
    const article = node.querySelector('.movie');
    const thumb = node.querySelector('.thumb');
    const img = node.querySelector('img');
    const title = node.querySelector('h3');
    const path = node.querySelector('.path');
    const marks = node.querySelector('.marks');
    const meta = node.querySelector('.meta');
    const descriptionSlot = node.querySelector('.description-slot');
    const descriptionTrigger = node.querySelector('.description-trigger');
    const descriptionPopover = node.querySelector('.description-popover');
    const open = node.querySelector('.open');

    article.dataset.id = movie.id;
    title.textContent = movie.title || movie.relativePath;
    path.textContent = movie.folder;
    renderMarkButtons(marks, movie);
    open.innerHTML = iconSvg('play');
    meta.innerHTML = [
      metaItem(formatDuration(movie.duration)),
      metaItem(formatResolution(movie)),
      metaItem(formatSize(movie.size))
    ].join('');

    if (movie.description) {
      const descriptionId = `description-${movie.id}`;
      descriptionTrigger.hidden = false;
      descriptionTrigger.innerHTML = iconSvg('info');
      descriptionTrigger.title = 'Show description';
      descriptionTrigger.setAttribute('aria-describedby', descriptionId);
      descriptionPopover.hidden = false;
      descriptionPopover.id = descriptionId;
      descriptionPopover.textContent = movie.description;

      descriptionTrigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !descriptionSlot.classList.contains('open');
        closeDescriptionPopovers(descriptionSlot);
        setDescriptionOpen(descriptionSlot, willOpen);
      });
    } else {
      descriptionSlot.hidden = true;
    }

    if (movie.thumbnail) {
      img.src = movie.thumbnail;
      img.alt = `${movie.title} preview strip`;
      thumb.addEventListener('mouseenter', (event) => showHoverPreview(event, movie));
      thumb.addEventListener('mousemove', positionHoverPreview);
      thumb.addEventListener('mouseleave', hideHoverPreview);
    } else {
      thumb.classList.add('missing');
    }

    open.addEventListener('click', async () => {
      open.disabled = true;
      open.setAttribute('aria-label', 'Opening in IINA');
      open.innerHTML = iconSvg('refresh');
      try {
        await openMovie(movie);
      } finally {
        open.disabled = false;
        open.setAttribute('aria-label', 'Open in IINA');
        open.innerHTML = iconSvg('play');
      }
    });

    fragment.append(node);
  }

  movieGrid.append(fragment);
}

async function refreshLibrary() {
  const response = await fetch('/api/library');
  library = await response.json();
  rescanButton.disabled = library.scanning;
  library.movies.forEach(movieArtists);
  rescanButton.innerHTML = library.scanning
    ? `${iconSvg('refresh')}Scanning...`
    : `${iconSvg('refresh')}Rescan Library`;
  renderCollections();
  renderSubfolders();
  renderArtists();
  renderMarkFilter();
  renderMovies();
  if (activeView === 'artists') renderArtistCards();
  if (library.scanning) {
    setTimeout(refreshLibrary, 2500);
  }
}

moviesViewButton.addEventListener('click', () => setView('movies'));
artistsViewButton.addEventListener('click', () => setView('artists'));
searchInput.addEventListener('input', renderMovies);
sortSelect.addEventListener('change', renderMovies);
subfolderSelect.addEventListener('change', () => {
  activeSubfolder = subfolderSelect.value;
  activeArtist = 'All Artists';
  renderArtists();
  renderMovies();
});
artistSelect.addEventListener('change', () => {
  activeArtist = artistSelect.value;
  renderMovies();
});
markFilterSelect.addEventListener('change', () => {
  activeMarkFilter = markFilterSelect.value;
  renderMovies();
});
artistSearchInput.addEventListener('input', renderArtistCards);
artistSortSelect.addEventListener('change', renderArtistCards);
artistListSelect.addEventListener('change', renderArtistCards);
document.addEventListener('click', () => closeCustomSelects());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCustomSelects();
    closeDescriptionPopovers();
  }
});
document.addEventListener('click', () => closeDescriptionPopovers());
window.addEventListener('resize', () => {
  closeCustomSelects();
  closeDescriptionPopovers();
});
window.addEventListener('scroll', () => {
  closeCustomSelects();
  closeDescriptionPopovers();
}, true);
rescanButton.addEventListener('click', async () => {
  rescanButton.disabled = true;
  rescanButton.innerHTML = `${iconSvg('refresh')}Scanning...`;
  await fetch('/api/rescan', { method: 'POST' });
  setTimeout(refreshLibrary, 700);
});

setupCustomSelects();
refreshLibrary();
