import { createHash } from 'node:crypto';
import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { ENGLISH_SUB_COLLECTIONS, isEnglishSubtitleFile, normalizedMovieKey, normalizedSubtitleKey } from './english-subs.js';

// Only called on explicit playback. Never scans videos or periodically touches the drive.
export class PlaybackSubtitles {
  constructor(root) { this.root = root; this.catalogs = new Map(); this.files = new Map(); }
  clear() { this.catalogs.clear(); this.files.clear(); }
  async safeFile(path) {
    const [root, file] = await Promise.all([realpath(this.root), realpath(path)]);
    if (!file.startsWith(root + '/')) throw new Error('Subtitle is outside the library');
    const info = await stat(file);
    if (!info.isFile() || info.size > 16 * 1024 * 1024 || !isEnglishSubtitleFile(file)) throw new Error('Invalid subtitle');
    return file;
  }
  async collect(directory, recursive = false) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const files = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      // Do not follow directory symlinks. Check file realpaths again when serving.
      if (recursive && entry.isDirectory()) files.push(...await this.collect(path, true));
      else if (entry.isFile() && isEnglishSubtitleFile(path)) files.push(path);
    }
    return files;
  }
  async collectionFiles(collection) {
    if (!this.catalogs.has(collection)) {
      const pending = (async () => {
        const directory = join(this.root, collection);
        let entries;
        try { entries = await readdir(directory, { withFileTypes: true }); }
        catch (error) { if (error.code === 'ENOENT') return []; throw error; }
        const result = [];
        for (const entry of entries) {
          if (entry.isDirectory() && /^sub(?:$|[-_ ])/i.test(entry.name)) result.push(...await this.collect(join(directory, entry.name), true));
        }
        return result;
      })();
      this.catalogs.set(collection, pending);
      pending.catch(() => this.catalogs.delete(collection));
    }
    return this.catalogs.get(collection);
  }
  async tracks(movie) {
    const moviePath = await realpath(movie.path), root = await realpath(this.root);
    if (!moviePath.startsWith(root + '/')) throw new Error('Movie is outside the library');
    const collection = movie.relativePath.split('/')[0];
    const candidates = await this.collect(dirname(moviePath));
    if (ENGLISH_SUB_COLLECTIONS.has(collection.toLowerCase())) candidates.push(...await this.collectionFiles(collection));
    const key = normalizedMovieKey(moviePath), result = [];
    for (const path of [...new Set(candidates)].sort()) {
      if (normalizedSubtitleKey(path) !== key) continue;
      const file = await this.safeFile(path);
      const token = createHash('sha256').update(relative(root, file)).digest('hex');
      this.files.set(token, file);
      result.push({ id: token, language: 'eng', title: basename(file), url: `/api/subtitles/file/${token}` });
    }
    return result;
  }
  async file(token) {
    const path = this.files.get(token);
    if (!path) throw new Error('Subtitle not found');
    return this.safeFile(path);
  }
}
