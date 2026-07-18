import { basename, extname } from 'node:path';

export const ENGLISH_SUB_COLLECTIONS = new Set(['jav', 'hrine']);

const SUBTITLE_EXTENSIONS = new Set(['.ass', '.srt', '.ssa', '.sub', '.vtt']);
const VIDEO_EXTENSIONS = /\.(?:avi|m4v|mkv|mov|mp4|webm)$/i;

export function collectionFromRelativePath(relativePath) {
  return relativePath.split('/')[0]?.toLowerCase() || '';
}

export function isEnglishSubCollection(relativePath) {
  return ENGLISH_SUB_COLLECTIONS.has(collectionFromRelativePath(relativePath));
}

export function hasEnglishSubWording(filePath) {
  const title = basename(filePath, extname(filePath));
  return /(?:^|[\s._[\]()-])(?:eng(?:lish)?[\s._-]*sub(?:title)?s?|sub(?:title)?s?|subbed)(?=$|[\s._[\]()-])/i.test(title);
}

export function isEnglishSubtitleFile(filePath) {
  if (!SUBTITLE_EXTENSIONS.has(extname(filePath).toLowerCase())) return false;

  const name = basename(filePath).toLowerCase();
  return !/(?:^|[._-])ja(?:[._-]|$)|kimi-source/.test(name);
}

export function normalizedMovieKey(filePath) {
  return normalizeName(basename(filePath).replace(VIDEO_EXTENSIONS, ''));
}

export function normalizedSubtitleKey(filePath) {
  let name = basename(filePath).replace(/\.(?:ass|srt|ssa|sub|vtt)$/i, '');

  name = name
    .replace(/\.ja\.whisperjav(?:\..+)?\.english$/i, '')
    .replace(/\.ja\.whisperjav\.english$/i, '')
    .replace(/(?:[._ -](?:en|eng|english))+$/i, '')
    .replace(VIDEO_EXTENSIONS, '');

  return normalizeName(name);
}

export function subtitleCatalogKey(collection, mediaKey) {
  return `${collection.toLowerCase()}:${mediaKey}`;
}

export function movieHasEnglishSub({ relativePath, finderTags = '', subtitleKeys = new Set() }) {
  if (!isEnglishSubCollection(relativePath)) return false;
  if (hasEnglishSubWording(relativePath)) return true;
  if (/\bgreen\b/i.test(finderTags)) return true;

  const collection = collectionFromRelativePath(relativePath);
  return subtitleKeys.has(subtitleCatalogKey(collection, normalizedMovieKey(relativePath)));
}

function normalizeName(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
