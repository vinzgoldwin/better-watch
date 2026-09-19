export const UNCATEGORIZED = 'uncategorized';

export function categoryKey(category) {
  return `category:${category.toLowerCase()}`;
}

export function readCategories(tags = {}) {
  const genre = Object.entries(tags).find(([key]) => key.toLowerCase() === 'genre')?.[1];
  if (typeof genre !== 'string') return [];
  const categories = new Map();
  for (const part of genre.split(/[;,|]/)) {
    const category = part.trim().replace(/\s+/g, ' ');
    if (category) categories.set(categoryKey(category), category);
  }
  return [...categories.values()];
}

export function matchesCategories(movie, selected) {
  if (!selected.length) return true;
  const categories = movie.categories || [];
  return categories.length
    ? categories.some((category) => selected.includes(categoryKey(category)))
    : selected.includes(UNCATEGORIZED);
}

export function buildCategoryOptions(movies) {
  const options = new Map();
  let uncategorized = 0;
  for (const movie of movies) {
    if (!movie.categories?.length) uncategorized++;
    const seen = new Set();
    for (const category of movie.categories || []) {
      const value = categoryKey(category);
      if (seen.has(value)) continue;
      seen.add(value);
      const option = options.get(value) || { value, label: category, count: 0 };
      option.count++;
      options.set(value, option);
    }
  }
  return [
    ...[...options.values()].sort((a, b) => a.label.localeCompare(b.label)),
    { value: UNCATEGORIZED, label: 'Uncategorized', count: uncategorized }
  ];
}
