export function movieMatchesSubfolder(movie, activeSubfolder) {
  return activeSubfolder === 'All Subfolders' || movie.folder === activeSubfolder || movie.folder.startsWith(`${activeSubfolder}/`);
}

export function buildSubfolderOptions(directories, movies, activeFolder) {
  const counts = new Map();
  let total = 0;

  function addPath(path, count) {
    const parts = path.split('/').filter(Boolean);
    if (activeFolder !== 'All Films' && parts[0] !== activeFolder) return;
    // Include inferred ancestors so cached libraries also expose every depth.
    const start = activeFolder === 'All Films' ? 1 : 2;
    for (let depth = start; depth <= parts.length; depth += 1) {
      const value = parts.slice(0, depth).join('/');
      counts.set(value, (counts.get(value) || 0) + count);
    }
  }

  for (const directory of directories) addPath(directory, 0);
  for (const movie of movies) {
    if (activeFolder !== 'All Films' && movie.topFolder !== activeFolder) continue;
    total += 1;
    addPath(movie.folder, 1);
  }

  return [
    { value: 'All Subfolders', label: 'All Subfolders', count: total },
    ...[...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({ value, label: value.split('/').join(' / '), count }))
  ];
}

export function filterFolderOption(option, query) {
  const normalized = query.trim().toLowerCase().replace(/\s*\/\s*/g, '/');
  return option.value.toLowerCase().includes(normalized);
}
