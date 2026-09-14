import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSubfolderOptions, filterFolderOption, movieMatchesSubfolder } from './folders.js';

const movies = [
  { topFolder: 'Cinema', folder: 'Cinema' },
  { topFolder: 'Cinema', folder: 'Cinema/Japan/Drama/Classics' },
  { topFolder: 'Cinema', folder: 'Cinema/Japan/Drama/Classics' },
  { topFolder: 'Cinema', folder: 'Cinema/Korea/Drama' },
  { topFolder: 'Cinema Extras', folder: 'Cinema Extras/Japan/Drama' }
];

test('exposes all depths and counts descendants once, including inferred ancestors', () => {
  const options = buildSubfolderOptions(['Cinema/Japan/Drama/Classics', 'Cinema/Japan/Empty'], movies, 'All Films');
  const counts = Object.fromEntries(options.map(({ value, count }) => [value, count]));
  assert.equal(counts['All Subfolders'], 5);
  assert.equal(counts.Cinema, 4);
  assert.equal(counts['Cinema/Japan'], 2);
  assert.equal(counts['Cinema/Japan/Drama'], 2);
  assert.equal(counts['Cinema/Japan/Drama/Classics'], 2);
  assert.equal(counts['Cinema/Japan/Empty'], 0);
  assert.equal(options.find(({ value }) => value === 'Cinema/Korea/Drama').label, 'Cinema / Korea / Drama');
});

test('collection scope excludes its root and similarly named collections', () => {
  const options = buildSubfolderOptions(['Cinema Extras/Empty'], movies, 'Cinema');
  assert.equal(options[0].count, 4);
  assert.ok(options.slice(1).every(({ value }) => value.startsWith('Cinema/')));
  assert.ok(options.some(({ value }) => value === 'Cinema/Japan/Drama/Classics'));
  assert.deepEqual(buildSubfolderOptions([], [], 'Cinema'), [
    { value: 'All Subfolders', label: 'All Subfolders', count: 0 }
  ]);
});

test('selected folders include descendants but exclude siblings with a shared prefix', () => {
  assert.equal(movieMatchesSubfolder(movies[1], 'Cinema/Japan/Drama'), true);
  assert.equal(movieMatchesSubfolder(movies[1], 'Cinema/Japan/Drama/Classics'), true);
  assert.equal(movieMatchesSubfolder({ folder: 'Cinema/Japan/Drama Extra' }, 'Cinema/Japan/Drama'), false);
  assert.equal(movieMatchesSubfolder(movies[3], 'Cinema/Japan/Drama'), false);
  assert.ok(movies.every((movie) => movieMatchesSubfolder(movie, 'All Subfolders')));
});

test('search matches full paths regardless of case or separator spacing', () => {
  const options = buildSubfolderOptions([], movies, 'All Films');
  const search = (query) => options.filter((option) => filterFolderOption(option, query));
  assert.equal(search('drama').length, 4);
  assert.deepEqual(search(' JAPAN / DRAMA / classics ').map(({ value }) => value), ['Cinema/Japan/Drama/Classics']);
  assert.equal(search('missing').length, 0);
  assert.equal(search('').length, options.length);
});
