import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { enrichMoviesWithArtists } from './src/lib/artists.js';
import { embeddedDescription } from './src/lib/descriptions.js';
import { readReleaseDate } from './src/lib/release-date.js';
import { MediaQueue } from './src/lib/media-queue.js';
import { streamFile } from './src/lib/stream-file.js';
import { PlaybackSubtitles } from './src/lib/playback-subtitles.js';
import { previewStart } from './src/lib/gallery.js';
import { readCategories } from './src/lib/categories.js';
import {
  ENGLISH_SUB_COLLECTIONS,
  isEnglishSubtitleFile,
  movieHasEnglishSub,
  normalizedSubtitleKey,
  subtitleCatalogKey
} from './src/lib/english-subs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const REMOTE_PLAYBACK = process.env.REMOTE_PLAYBACK === '1';
const LIBRARY_ROOT = process.env.LIBRARY_ROOT || '/Volumes/Ultra Touch';
const CACHE_DIR = process.env.CACHE_DIR || join(LIBRARY_ROOT, '.better-watch-cache');
const THUMB_DIR = join(CACHE_DIR, 'thumbs');
const PREVIEW_DIR = join(CACHE_DIR, 'previews');
const INDEX_PATH = join(CACHE_DIR, 'index.json');
const playbackSubtitles = new PlaybackSubtitles(LIBRARY_ROOT);
const PUBLIC_DIR = join(__dirname, 'public');
const PREVIEW_DURATION_SECONDS = 6;

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.m4v', '.webm']);
const APPLEDOUBLE_MAGIC = Buffer.from([0x00, 0x05, 0x16, 0x07]);
const SIDECAR_CLEANUP_CONFIRMATION = 'remove-appledouble-sidecars';
const IGNORED_DIRS = new Set([
  '.Spotlight-V100',
  '.TemporaryItems',
  '.Trashes',
  '.fseventsd',
  'System Volume Information',
  'Start_Here_Mac.app',
  'Seagate'
]);

let deletingMovie = false;

let library = {
  root: LIBRARY_ROOT,
  generatedAt: null,
  scanning: false,
  movies: [],
  directories: [],
  errors: []
};

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }

      rejectPromise(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        request.destroy();
        rejectPromise(new Error('Request body too large'));
      }
    });
    request.on('end', () => {
      try {
        resolvePromise(JSON.parse(body || '{}'));
      } catch (error) {
        rejectPromise(error);
      }
    });
    request.on('error', rejectPromise);
  });
}

function cleanTitle(filePath) {
  const raw = basename(filePath, extname(filePath));
  return raw
    .replace(/^missa[_-]?/i, '')
    .replace(/[_-]?\d{10,}m?(4k16|1080|720)?(_new\d*)?$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\bpt(\d+)\b/gi, 'pt $1')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatFolder(relativePath) {
  const parts = relativePath.split('/');
  parts.pop();
  return parts.join('/') || 'Root';
}

function fileHash(filePath, stats) {
  return createHash('sha1')
    .update(`${filePath}:${stats.mtimeMs}:${stats.size}`)
    .digest('hex');
}

function parseDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
}

async function readFinderComment(filePath) {
  try {
    const output = await run('mdls', ['-raw', '-name', 'kMDItemFinderComment', filePath]);
    const comment = output.trim();
    if (!comment || comment === '(null)') return null;
    return comment.replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

async function readFinderTags(filePath) {
  try {
    const output = await run('mdls', ['-raw', '-name', 'kMDItemUserTags', filePath]);
    return output.trim() === '(null)' ? '' : output;
  } catch {
    return '';
  }
}

async function collectEnglishSubtitleKeys(dir, collection, found) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('._')) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectEnglishSubtitleKeys(fullPath, collection, found);
    } else if (entry.isFile() && isEnglishSubtitleFile(fullPath)) {
      const key = normalizedSubtitleKey(fullPath);
      if (key) found.add(subtitleCatalogKey(collection, key));
    }
  }
}

async function buildEnglishSubtitleCatalog(scope = '') {
  const keys = new Set();

  for (const collection of ENGLISH_SUB_COLLECTIONS) {
    if (scope && scope.split('/')[0].toLowerCase() !== collection) continue;
    const collectionPath = join(LIBRARY_ROOT, collection);
    let entries = [];
    try {
      entries = await readdir(collectionPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^sub(?:$|[-_ ])/i.test(entry.name)) continue;
      await collectEnglishSubtitleKeys(join(collectionPath, entry.name), collection, keys);
    }
  }

  return keys;
}

async function refreshEnglishSubtitleStatus(movies) {
  const subtitleKeys = await buildEnglishSubtitleCatalog();

  for (const movie of movies) {
    const collection = movie.relativePath.split('/')[0]?.toLowerCase();
    const finderTags = ENGLISH_SUB_COLLECTIONS.has(collection) ? await readFinderTags(movie.path) : '';
    movie.hasEnglishSub = movieHasEnglishSub({
      relativePath: movie.relativePath,
      finderTags,
      subtitleKeys
    });
  }
}

function shouldSkipDirectory(name) {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

function isInsideLibraryRoot(filePath) {
  const root = resolve(LIBRARY_ROOT);
  const resolvedPath = resolve(filePath);
  return resolvedPath === root || resolvedPath.startsWith(`${root}/`);
}

function isAppleDoubleName(name) {
  return name.startsWith('._') && name.length > 2;
}

async function isAppleDoubleFile(filePath) {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const header = Buffer.alloc(APPLEDOUBLE_MAGIC.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === APPLEDOUBLE_MAGIC.length && header.equals(APPLEDOUBLE_MAGIC);
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

async function walkAppleDoubleSidecars(dir, found = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    return found;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        await walkAppleDoubleSidecars(fullPath, found);
      }
      continue;
    }

    if (!entry.isFile() || !isAppleDoubleName(entry.name)) continue;

    const stats = await lstat(fullPath);
    if (!stats.isFile() || !isInsideLibraryRoot(fullPath)) continue;
    if (await isAppleDoubleFile(fullPath)) found.push(fullPath);
  }

  return found;
}

async function cleanupAppleDoubleSidecars() {
  const sidecars = await walkAppleDoubleSidecars(LIBRARY_ROOT, []);
  const removed = [];
  const failed = [];

  for (const filePath of sidecars) {
    const name = basename(filePath);
    if (!isAppleDoubleName(name) || !isInsideLibraryRoot(filePath)) continue;

    try {
      const stats = await lstat(filePath);
      if (!stats.isFile() || !(await isAppleDoubleFile(filePath))) continue;
      await rm(filePath);
      removed.push(relative(LIBRARY_ROOT, filePath));
    } catch (error) {
      failed.push({ path: relative(LIBRARY_ROOT, filePath), message: error.message });
    }
  }

  return {
    root: LIBRARY_ROOT,
    removedCount: removed.length,
    removed,
    failed
  };
}

async function walkDirectories(dir, found = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    library.errors.push({ path: dir, message: error.message });
    return found;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    const relativePath = relative(LIBRARY_ROOT, fullPath);
    if (relativePath) found.push(relativePath);
    await walkDirectories(fullPath, found);
  }

  return found;
}

async function listLibraryDirectories() {
  const directories = await walkDirectories(LIBRARY_ROOT, []);
  return directories.sort((a, b) => a.localeCompare(b));
}

async function walkVideos(dir, found = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    library.errors.push({ path: dir, message: error.message });
    return found;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('._')) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        await walkVideos(fullPath, found);
      }
      continue;
    }

    if (entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      found.push(fullPath);
    }
  }

  return found;
}

async function probeVideo(filePath) {
  const output = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:format=duration:format_tags=description,comment,date,release_date,year,genre',
    '-of',
    'json',
    filePath
  ]);
  const parsed = JSON.parse(output);
  const stream = parsed.streams?.[0] || {};
  return {
    duration: parseDuration(parsed.format?.duration),
    width: stream.width || null,
    height: stream.height || null,
    embeddedDescription: embeddedDescription(parsed.format?.tags),
    releaseDate: readReleaseDate(parsed.format?.tags),
    categories: readCategories(parsed.format?.tags)
  };
}

async function cachedMedia(path) {
  try { return (await stat(path)).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function generateThumb(filePath, id, duration, options) {
  const filename = `${id}-hd-v3.jpg`;
  if (await cachedMedia(join(THUMB_DIR, filename))) return `/thumbs/${filename}`;
  return mediaQueue.enqueue(`thumb:${id}`, () => buildThumb(filePath, id, duration), options);
}

async function generateCover(movie, width, options) {
  const filename = `${movie.id}-cover-${width}-v1.jpg`;
  const path = join(THUMB_DIR, filename);
  if (await cachedMedia(path)) return path;
  return mediaQueue.enqueue(`cover:${movie.id}:${width}`, async () => {
    await mkdir(THUMB_DIR, { recursive: true });
    const strip = join(THUMB_DIR, `${movie.id}-hd-v3.jpg`);
    const hasStrip = await cachedMedia(strip);
    const input = hasStrip ? ['-i', strip] : ['-ss', String(Math.floor((movie.duration || 0) * 0.5)), '-i', movie.path];
    const crop = hasStrip ? 'crop=iw/3:ih:iw/3:0' : "crop=w='trunc(min(iw,ih*16/9)/2)*2':h='trunc(min(ih,iw*9/16)/2)*2'";
    try {
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-frames:v', '1', '-vf', `${crop},scale=w='min(${width},iw)':h=-2`, '-q:v', '3', `${path}.partial.jpg`]);
      await rename(`${path}.partial.jpg`, path);
    } finally { await rm(`${path}.partial.jpg`, { force: true }); }
    return path;
  }, options);
}

async function buildThumb(filePath, id, duration) {
  await mkdir(THUMB_DIR, { recursive: true });
  const outPath = join(THUMB_DIR, `${id}-hd-v3.jpg`);
  if (existsSync(outPath)) return `/thumbs/${id}-hd-v3.jpg`;

  const safeDuration = duration > 0 ? duration : 1;
  const start = Math.floor(safeDuration * 0.12);
  const middle = Math.floor(safeDuration * 0.5);
  const late = Math.floor(safeDuration * 0.78);
  const frames = [start, middle, late].map((time, index) => join(THUMB_DIR, `${id}-hd-v3-${index}.jpg`));

  for (const [index, time] of [start, middle, late].entries()) {
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(time),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      "crop=w='trunc(min(iw,ih*16/9)/2)*2':h='trunc(min(ih,iw*9/16)/2)*2',scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      '-q:v',
      '3',
      frames[index]
    ]);
  }

  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    frames[0],
    '-i',
    frames[1],
    '-i',
    frames[2],
    '-filter_complex',
    '[0:v][1:v][2:v]hstack=inputs=3',
    '-q:v',
    '3',
    `${outPath}.partial.jpg`
  ]);

  await rename(`${outPath}.partial.jpg`, outPath);
  await Promise.all(frames.map((frame) => rm(frame, { force: true })));

  return `/thumbs/${id}-hd-v3.jpg`;
}

const mediaQueue = new MediaQueue();

async function generatePreview(filePath, id, duration, moment, signal) {
  const filename = moment === undefined ? `${id}-hd-v3.mp4` : `${id}-moment-${moment}-hd-v3.mp4`;
  if (await cachedMedia(join(PREVIEW_DIR, filename))) return `/previews/${filename}`;
  return mediaQueue.enqueue(`preview:${id}:${moment ?? 'legacy'}`, () => buildPreview(filePath, id, duration, moment), { priority: 2, signal });
}

async function buildPreview(filePath, id, duration, moment) {
  await mkdir(PREVIEW_DIR, { recursive: true });
  // Version the cache so older low-resolution clips are regenerated on demand.
  const filename = moment === undefined ? `${id}-hd-v3.mp4` : `${id}-moment-${moment}-hd-v3.mp4`;
  const outPath = join(PREVIEW_DIR, filename);
  if (existsSync(outPath)) return `/previews/${filename}`;

  const tempPath = join(PREVIEW_DIR, `${filename}.partial.mp4`);
  const safeDuration = duration && duration > PREVIEW_DURATION_SECONDS + 4 ? duration : null;
  const latestStart = safeDuration ? Math.max(0, safeDuration - PREVIEW_DURATION_SECONDS - 1) : 0;
  const start = moment === undefined ? (safeDuration ? Math.min(Math.max(2, Math.floor(safeDuration * 0.22)), latestStart) : 0) : previewStart(duration, moment, PREVIEW_DURATION_SECONDS);

  try {
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(start),
      '-i',
      filePath,
      '-t',
      String(PREVIEW_DURATION_SECONDS),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-ac',
      '2',
      '-vf',
      "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24,format=yuv420p",
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-movflags',
      '+faststart',
      tempPath
    ]);
    await rename(tempPath, outPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }

  return `/previews/${filename}`;
}

async function loadCachedIndex() {
  try {
    const text = await readFile(INDEX_PATH, 'utf8');
    library = JSON.parse(text);
    library.directories = Array.isArray(library.directories) ? library.directories : await listLibraryDirectories();
    library.movies = Array.isArray(library.movies) ? enrichMoviesWithArtists(library.movies) : [];
    if (library.movies.some((movie) => movie.hasEnglishSub === undefined)) await refreshEnglishSubtitleStatus(library.movies);
  } catch {
    library = {
      root: LIBRARY_ROOT,
      generatedAt: null,
      scanning: false,
      movies: [],
      directories: await listLibraryDirectories(),
      errors: []
    };
  }
}

function pathWithin(path, scope) {
  return !scope || path === scope || path.startsWith(`${scope}/`);
}

async function scanLibrary(scope = '') {
  if (library.scanning || deletingMovie) return library;

  const scanRoot = resolve(LIBRARY_ROOT, scope);
  // Validate accessibility before changing the visible index.
  await readdir(scanRoot);
  if (library.scanning || deletingMovie) return library;
  const previous = new Map(library.movies.map((movie) => [movie.path, movie]));
  const retained = library.movies.filter((movie) => !pathWithin(movie.relativePath, scope));
  const previousDirectories = library.directories || [];
  library.scanning = true;
  library.generatedAt = new Date().toISOString();
  library.movies = retained;
  library.errors = [];

  await mkdir(THUMB_DIR, { recursive: true });
  const [paths, scannedDirectories] = await Promise.all([
    walkVideos(scanRoot),
    walkDirectories(scanRoot)
  ]);
  const directories = previousDirectories.filter((directory) => !pathWithin(directory, scope));
  if (scope) directories.push(scope);
  directories.push(...scannedDirectories);
  const subtitleKeys = await buildEnglishSubtitleCatalog(scope);
  const movies = [...retained];

  for (const filePath of paths) {
    try {
      const stats = await stat(filePath);
      const id = fileHash(filePath, stats);
      const relativePath = relative(LIBRARY_ROOT, filePath);
      const cached = previous.get(filePath);
      const collection = relativePath.split('/')[0]?.toLowerCase();
      const [finderComment, finderTags] = await Promise.all([
        readFinderComment(filePath),
        ENGLISH_SUB_COLLECTIONS.has(collection) ? readFinderTags(filePath) : Promise.resolve('')
      ]);
      const hasEnglishSub = movieHasEnglishSub({ relativePath, finderTags, subtitleKeys });

      const unchanged = cached?.id === id;
      let probe = { duration: null, width: null, height: null };
      let failed = null;

      // Reuse embedded metadata only while the file is unchanged. Older indexes
      // are probed once; a successful empty result is cached too.
      if (!unchanged || !cached.thumbnail || !Object.hasOwn(cached, 'categories') || !Object.hasOwn(cached, 'releaseDate') || (!finderComment && !Object.hasOwn(cached, 'embeddedDescription'))) {
        try {
          probe = await probeVideo(filePath);
        } catch (error) {
          failed = `Probe failed: ${error.message}`;
        }
      }
      const embedded = Object.hasOwn(probe, 'embeddedDescription')
        ? probe.embeddedDescription
        : unchanged ? cached.embeddedDescription : undefined;
      const releaseDate = Object.hasOwn(probe, 'releaseDate')
        ? probe.releaseDate
        : unchanged ? cached.releaseDate : undefined;
      const description = finderComment || embedded || null;
      const categories = probe.categories ?? (unchanged ? cached.categories : undefined);

      if (unchanged && cached.thumbnail) {
        movies.push({
          ...cached,
          preview: existsSync(join(PREVIEW_DIR, `${id}.mp4`)) ? `/previews/${id}.mp4` : null,
          embeddedDescription: embedded,
          description,
          releaseDate,
          categories,
          hasEnglishSub
        });
        if (movies.length % 8 === 0) library.movies = [...movies];
        continue;
      }

      let thumbnail = null;

      try {
        thumbnail = await generateThumb(filePath, id, probe.duration);
      } catch (error) {
        failed = failed || `Thumbnail failed: ${error.message}`;
      }

      movies.push({
        id,
        path: filePath,
        relativePath,
        title: cleanTitle(filePath),
        folder: formatFolder(relativePath),
        topFolder: relativePath.split('/')[0] || 'Root',
        extension: extname(filePath).slice(1).toUpperCase(),
        size: stats.size,
        modified: stats.mtimeMs,
        description,
        releaseDate,
        categories,
        embeddedDescription: embedded,
        hasEnglishSub,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        thumbnail,
        preview: existsSync(join(PREVIEW_DIR, `${id}.mp4`)) ? `/previews/${id}.mp4` : null,
        failed
      });
      if (movies.length % 4 === 0) library.movies = [...movies];
    } catch (error) {
      library.errors.push({ path: filePath, message: error.message });
    }
  }

  // An unreadable subtree is not evidence that its cached files were deleted.
  const indexedPaths = new Set(movies.map((movie) => movie.path));
  for (const movie of previous.values()) {
    if (!indexedPaths.has(movie.path) && library.errors.some((error) => pathWithin(movie.path, error.path))) {
      movies.push(movie);
    }
  }
  for (const directory of previousDirectories) {
    if (library.errors.some((error) => pathWithin(join(LIBRARY_ROOT, directory), error.path))) directories.push(directory);
  }
  movies.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  library = {
    root: LIBRARY_ROOT,
    generatedAt: new Date().toISOString(),
    scanning: false,
    movies: enrichMoviesWithArtists(movies),
    directories: [...new Set(directories)].sort((a, b) => a.localeCompare(b)),
    errors: library.errors
  };

  await writeFile(INDEX_PATH, JSON.stringify(library, null, 2));
  return library;
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);

  if (requestPath.startsWith('/thumbs/')) {
    let thumbPath = resolve(THUMB_DIR, requestPath.replace('/thumbs/', ''));
    const quality = url.searchParams.get('quality');
    if (quality === 'hd' || quality === 'cover') {
      const movie = library.movies.find((item) => item.thumbnail === requestPath);
      if (movie) {
        try {
          const controller = new AbortController();
          response.once('close', () => controller.abort());
          if (quality === 'cover') {
            const width = url.searchParams.get('width') === '960' ? 960 : 480;
            thumbPath = await generateCover(movie, width, { signal: controller.signal });
          } else {
            const upgraded = await generateThumb(movie.path, movie.id, movie.duration, { priority: 1, signal: controller.signal });
            thumbPath = join(THUMB_DIR, basename(upgraded));
          }
          if (response.destroyed) return;
        } catch {
          if (response.destroyed) return;
          response.writeHead(503, { 'cache-control': 'no-store' });
          response.end('Thumbnail generation failed');
          return;
        }
      }
    }
    if (!thumbPath.startsWith(resolve(THUMB_DIR)) || !existsSync(thumbPath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000' });
    createReadStream(thumbPath).pipe(response);
    return;
  }

  if (requestPath.startsWith('/previews/')) {
    const previewPath = resolve(PREVIEW_DIR, requestPath.replace('/previews/', ''));
    if (!previewPath.startsWith(resolve(PREVIEW_DIR)) || !existsSync(previewPath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    await streamFile(request, response, previewPath, { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000' });
    return;
  }

  const filePath = resolve(PUBLIC_DIR, `.${requestPath}`);
  if (!filePath.startsWith(resolve(PUBLIC_DIR)) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  response.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith('/api/subtitles/') && ['GET', 'HEAD'].includes(request.method)) {
    try {
      if (url.pathname.startsWith('/api/subtitles/file/')) {
        const path = await playbackSubtitles.file(url.pathname.slice('/api/subtitles/file/'.length));
        await streamFile(request, response, path);
      } else {
        const movie = library.movies.find(item => item.id === url.pathname.slice('/api/subtitles/'.length));
        if (!movie) throw new Error('Movie not found');
        sendJson(response, 200, { tracks: await playbackSubtitles.tracks(movie) });
      }
    } catch (error) {
      if (!response.headersSent) sendJson(response, 404, { error: error.message });
      else response.destroy(error);
    }
    return;
  }

  if (url.pathname.startsWith('/api/stream/') && ['GET', 'HEAD'].includes(request.method)) {
    const movie = library.movies.find((item) => item.id === url.pathname.slice('/api/stream/'.length));
    if (!movie) { sendJson(response, 404, { error: 'Movie not found' }); return; }
    try {
      const path = await realpath(movie.path);
      const root = await realpath(LIBRARY_ROOT);
      if (!path.startsWith(root + '/')) throw new Error('Video is outside the library');
      await streamFile(request, response, path);
    } catch (error) {
      if (!response.headersSent) sendJson(response, 404, { error: error.message });
      else response.destroy(error);
    }
    return;
  }

  if (url.pathname === '/api/library/status' && request.method === 'GET') {
    sendJson(response, 200, { scanning: library.scanning, generatedAt: library.generatedAt });
    return;
  }

  if (url.pathname === '/api/library' && request.method === 'GET') {
    sendJson(response, 200, library);
    return;
  }

  if (url.pathname === '/api/rescan' && request.method === 'POST') {
    try {
      const { folder = '' } = await readJsonBody(request);
      if (typeof folder !== 'string' || !isInsideLibraryRoot(resolve(LIBRARY_ROOT, folder))) {
        sendJson(response, 400, { error: 'Choose a folder within the library.' });
        return;
      }
      const scanRoot = resolve(LIBRARY_ROOT, folder);
      await readdir(scanRoot);
      if (library.scanning || deletingMovie) {
        sendJson(response, 409, { error: 'A scan is already running.' });
        return;
      }
      playbackSubtitles.clear();
      scanLibrary(relative(LIBRARY_ROOT, scanRoot)).catch((error) => {
        library.scanning = false;
        library.errors.push({ path: scanRoot, message: error.message });
      });
      sendJson(response, 202, { scanning: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/sidecars/cleanup' && request.method === 'POST') {
    try {
      const { confirm } = await readJsonBody(request);
      if (confirm !== SIDECAR_CLEANUP_CONFIRMATION) {
        sendJson(response, 400, { error: 'Cleanup confirmation is required' });
        return;
      }

      sendJson(response, 200, await cleanupAppleDoubleSidecars());
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/movie' && request.method === 'DELETE') {
    let locked = false;
    try {
      const { id, confirm } = await readJsonBody(request);
      if (confirm !== 'delete-from-disk') {
        sendJson(response, 400, { error: 'Permanent deletion confirmation is required.' });
        return;
      }
      if (library.scanning || deletingMovie) {
        sendJson(response, 409, { error: 'Wait for the current scan or deletion to finish.' });
        return;
      }
      const movie = library.movies.find((item) => item.id === id);
      if (!movie) {
        sendJson(response, 404, { error: 'Movie not found.' });
        return;
      }
      // Serialize deletion with scans so a scan cannot restore a deleted entry.
      deletingMovie = locked = true;
      const root = await realpath(LIBRARY_ROOT);
      const path = await realpath(movie.path);
      const withinRoot = relative(root, path);
      const stats = await lstat(movie.path);
      if (!withinRoot || withinRoot === '..' || withinRoot.startsWith('../') || !stats.isFile()) {
        throw new Error('Only video files within the library can be deleted.');
      }
      if (fileHash(movie.path, stats) !== movie.id) {
        throw new Error('The video has changed. Rescan before deleting it.');
      }
      await unlink(movie.path);
      library.movies = library.movies.filter((item) => item.id !== id);
      library.generatedAt = new Date().toISOString();
      try {
        await writeFile(INDEX_PATH, JSON.stringify(library, null, 2));
      } catch (error) {
        sendJson(response, 200, { deleted: true, warning: `Video deleted, but the index could not be saved: ${error.message}` });
        return;
      }
      sendJson(response, 200, { deleted: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    } finally {
      if (locked) deletingMovie = false;
    }
    return;
  }

  if (url.pathname === '/api/preview' && request.method === 'POST') {
    try {
      const { id, moment } = await readJsonBody(request);
      if (moment !== undefined) previewStart(0, moment);
      const movie = library.movies.find((item) => item.id === id);
      if (!movie) {
        sendJson(response, 404, { error: 'Movie not found' });
        return;
      }

      const controller = new AbortController();
      response.once('close', () => controller.abort());
      const preview = await generatePreview(movie.path, movie.id, movie.duration, moment, controller.signal);
      if (response.destroyed) return;
      if (moment === undefined) {
        movie.preview = preview;
        await writeFile(INDEX_PATH, JSON.stringify(library, null, 2));
      }
      sendJson(response, 200, { preview });
    } catch (error) {
      if (response.destroyed) return;
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/open' && request.method === 'POST') {
    try {
      const { id } = await readJsonBody(request);
      const movie = library.movies.find((item) => item.id === id);
      if (!movie) {
        sendJson(response, 404, { error: 'Movie not found' });
        return;
      }

      if (REMOTE_PLAYBACK) {
        sendJson(response, 200, { ok: true, stream: `/api/stream/${movie.id}` });
        return;
      }
      const opener = spawn('open', ['-a', 'IINA', movie.path], { detached: true, stdio: 'ignore' });
      opener.unref();
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

// Require the library to be present; never create a substitute mount directory.
await stat(LIBRARY_ROOT);
await mkdir(CACHE_DIR, { recursive: true });
await loadCachedIndex();
if (!library.generatedAt) {
  scanLibrary().catch((error) => {
    library.scanning = false;
    library.errors.push({ path: LIBRARY_ROOT, message: error.message });
  });
}

const server = http.createServer((request, response) => {
  if (request.url?.startsWith('/api/')) {
    handleApi(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Ultra Touch Gallery: http://localhost:${PORT}`);
  console.log(`Library root: ${LIBRARY_ROOT}`);
});
