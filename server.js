import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const LIBRARY_ROOT = process.env.LIBRARY_ROOT || '/Volumes/Ultra Touch';
const CACHE_DIR = join(__dirname, '.cache');
const THUMB_DIR = join(CACHE_DIR, 'thumbs');
const INDEX_PATH = join(CACHE_DIR, 'index.json');
const PUBLIC_DIR = join(__dirname, 'public');

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
    'stream=width,height:format=duration',
    '-of',
    'json',
    filePath
  ]);
  const parsed = JSON.parse(output);
  const stream = parsed.streams?.[0] || {};
  return {
    duration: parseDuration(parsed.format?.duration),
    width: stream.width || null,
    height: stream.height || null
  };
}

async function generateThumb(filePath, id, duration) {
  const outPath = join(THUMB_DIR, `${id}.jpg`);
  if (existsSync(outPath)) return `/thumbs/${id}.jpg`;

  const safeDuration = duration && duration > 30 ? duration : 90;
  const start = Math.max(2, Math.floor(safeDuration * 0.12));
  const middle = Math.max(start + 1, Math.floor(safeDuration * 0.5));
  const late = Math.max(middle + 1, Math.floor(safeDuration * 0.78));
  const frames = [start, middle, late].map((time, index) => join(THUMB_DIR, `${id}-${index}.jpg`));

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
      'scale=320:180:force_original_aspect_ratio=increase,crop=320:180',
      '-q:v',
      '4',
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
    '4',
    outPath
  ]);

  await Promise.all(frames.map((frame) => rm(frame, { force: true })));

  return `/thumbs/${id}.jpg`;
}

async function loadCachedIndex() {
  try {
    const text = await readFile(INDEX_PATH, 'utf8');
    library = JSON.parse(text);
    library.directories = Array.isArray(library.directories) ? library.directories : await listLibraryDirectories();
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

async function scanLibrary() {
  if (library.scanning) return library;

  const previous = new Map(library.movies.map((movie) => [movie.path, movie]));
  library.scanning = true;
  library.generatedAt = new Date().toISOString();
  library.movies = [];
  library.errors = [];

  await mkdir(THUMB_DIR, { recursive: true });
  const [paths, directories] = await Promise.all([
    walkVideos(LIBRARY_ROOT),
    listLibraryDirectories()
  ]);
  const movies = [];

  for (const filePath of paths) {
    try {
      const stats = await stat(filePath);
      const id = fileHash(filePath, stats);
      const relativePath = relative(LIBRARY_ROOT, filePath);
      const cached = previous.get(filePath);
      const description = await readFinderComment(filePath);

      if (cached?.id === id && cached.thumbnail) {
        movies.push({
          ...cached,
          description
        });
        if (movies.length % 8 === 0) library.movies = [...movies];
        continue;
      }

      let probe = { duration: null, width: null, height: null };
      let thumbnail = null;
      let failed = null;

      try {
        probe = await probeVideo(filePath);
      } catch (error) {
        failed = `Probe failed: ${error.message}`;
      }

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
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        thumbnail,
        failed
      });
      if (movies.length % 4 === 0) library.movies = [...movies];
    } catch (error) {
      library.errors.push({ path: filePath, message: error.message });
    }
  }

  movies.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  library = {
    root: LIBRARY_ROOT,
    generatedAt: new Date().toISOString(),
    scanning: false,
    movies,
    directories,
    errors: library.errors
  };

  await writeFile(INDEX_PATH, JSON.stringify(library, null, 2));
  return library;
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);

  if (requestPath.startsWith('/thumbs/')) {
    const thumbPath = resolve(THUMB_DIR, requestPath.replace('/thumbs/', ''));
    if (!thumbPath.startsWith(resolve(THUMB_DIR)) || !existsSync(thumbPath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000' });
    createReadStream(thumbPath).pipe(response);
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

  if (url.pathname === '/api/library' && request.method === 'GET') {
    sendJson(response, 200, {
      ...library,
      directories: await listLibraryDirectories()
    });
    return;
  }

  if (url.pathname === '/api/rescan' && request.method === 'POST') {
    scanLibrary().catch((error) => {
      library.scanning = false;
      library.errors.push({ path: LIBRARY_ROOT, message: error.message });
    });
    sendJson(response, 202, { scanning: true });
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

  if (url.pathname === '/api/open' && request.method === 'POST') {
    try {
      const { id } = await readJsonBody(request);
      const movie = library.movies.find((item) => item.id === id);
      if (!movie) {
        sendJson(response, 404, { error: 'Movie not found' });
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

server.listen(PORT, () => {
  console.log(`Ultra Touch Gallery: http://localhost:${PORT}`);
  console.log(`Library root: ${LIBRARY_ROOT}`);
});
