import { readFile } from 'node:fs/promises';
import { enrichMoviesWithArtists, resolveMovieArtists } from '../src/lib/artists.js';

const indexPath = new URL('../.cache/index.json', import.meta.url);
const library = JSON.parse(await readFile(indexPath, 'utf8'));
const movies = Array.isArray(library.movies) ? library.movies : [];
const explicit = movies.map((movie) => ({ ...movie, artists: resolveMovieArtists(movie) }));
const enriched = enrichMoviesWithArtists(movies);

const explicitCount = explicit.filter((movie) => movie.artists.length).length;
const enrichedCount = enriched.filter((movie) => movie.artists.length).length;
const recovered = enriched.filter((movie, index) => !explicit[index].artists.length && movie.artists.length);
const unknown = enriched.filter((movie) => !movie.artists.length);

console.log(`Movies: ${movies.length}`);
console.log(`Explicit artist matches: ${explicitCount}`);
console.log(`Recovered by full-name filename matching: ${recovered.length}`);
console.log(`Still unknown: ${unknown.length}`);

if (recovered.length) {
  console.log('\nRecovered:');
  for (const movie of recovered) {
    console.log(`- ${movie.relativePath} -> ${movie.artists.join(', ')}`);
  }
}

const unknownByTopFolder = new Map();
for (const movie of unknown) {
  const topFolder = movie.folder.split('/')[0] || 'Root';
  if (!unknownByTopFolder.has(topFolder)) unknownByTopFolder.set(topFolder, []);
  unknownByTopFolder.get(topFolder).push(movie.relativePath);
}

console.log('\nStill unknown by top folder:');
for (const [folder, paths] of [...unknownByTopFolder].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`\n## ${folder} (${paths.length})`);
  for (const path of paths) console.log(path);
}
