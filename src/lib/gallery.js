export const PREVIEW_MOMENTS = [0.12, 0.5, 0.78];

export function resumeStart(position) {
  return position && Number.isFinite(position.seconds) && Number.isFinite(position.duration) &&
    position.seconds >= 5 && position.seconds < position.duration - 10 ? position.seconds : 0;
}

export function canContinue(mark, position) {
  return !mark?.watched && resumeStart(position) > 0;
}

// Use the complete filtered view, including tiles not yet rendered by pagination.
export function pickMovie(movies, marks, excluding = null) {
  const candidates = movies.filter(movie => !marks[movie.id]?.watched);
  const alternatives = candidates.filter(movie => movie.id !== excluding);
  const pool = alternatives.length ? alternatives : candidates;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function relativeMovieFolder(folder, collection, subfolder = 'All Subfolders') {
  const scope = subfolder !== 'All Subfolders' ? subfolder : collection !== 'All Films' ? collection : '';
  if (folder === scope) return '';
  return scope && folder.startsWith(`${scope}/`) ? folder.slice(scope.length + 1) : folder;
}

export function previewRowEnd(index, columns, count) {
  return index < 0 ? -1 : Math.min(count - 1, Math.floor(index / columns) * columns + columns - 1);
}

export function previewStart(duration, moment, clipLength = 6) {
  if (!Number.isInteger(moment) || moment < 0 || moment >= PREVIEW_MOMENTS.length) throw new Error('Invalid preview moment');
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(Math.floor(duration * PREVIEW_MOMENTS[moment]), Math.max(0, duration - clipLength));
}
