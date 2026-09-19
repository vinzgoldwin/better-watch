export const PREVIEW_MOMENTS = [0.12, 0.5, 0.78];

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
