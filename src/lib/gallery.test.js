import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeMovieFolder, previewRowEnd, previewStart, canContinue, resumeStart, pickMovie } from './gallery.js';

test('folder labels strip only the selected path boundary', () => {
  assert.equal(relativeMovieFolder('Studio/Drama/Short', 'All Films'), 'Studio/Drama/Short');
  assert.equal(relativeMovieFolder('Studio/Drama/Short', 'Studio'), 'Drama/Short');
  assert.equal(relativeMovieFolder('Studio/Drama/Short', 'Studio', 'Studio/Drama'), 'Short');
  assert.equal(relativeMovieFolder('Studio/Drama', 'Studio', 'Studio/Drama'), '');
  assert.equal(relativeMovieFolder('Studio/Drama Extras', 'Studio', 'Studio/Drama'), 'Studio/Drama Extras');
});

test('preview placement follows its movie across responsive and incomplete rows', () => {
  assert.equal(previewRowEnd(5, 4, 24), 7);
  assert.equal(previewRowEnd(5, 3, 24), 5);
  assert.equal(previewRowEnd(5, 2, 24), 5);
  assert.equal(previewRowEnd(24, 4, 25), 24);
  assert.equal(previewRowEnd(-1, 4, 25), -1);
});

test('preview samples stay within short and unknown movies', () => {
  assert.deepEqual([0, 1, 2].map((i) => previewStart(100, i)), [12, 50, 78]);
  assert.equal(previewStart(8, 2), 2);
  assert.equal(previewStart(3, 2), 0);
  assert.equal(previewStart(null, 1), 0);
  for (const invalid of [-1, 3, 0.5, '1', null]) assert.throws(() => previewStart(100, invalid));
});

test('continue watching uses resume boundaries and excludes watched films', () => {
  for (const [seconds, duration, expected] of [[4.999, 60, false], [5, 60, true], [49.999, 60, true], [50, 60, false], [0, 60, false], [60, 60, false], [10, 0, false], [NaN, 60, false], [10, Infinity, false]]) {
    const position = { seconds, duration };
    assert.equal(canContinue({}, position), expected, `${seconds}/${duration}`);
    assert.equal(resumeStart(position), expected ? seconds : 0);
  }
  assert.equal(canContinue({ watched: true }, { seconds: 30, duration: 90 }), false);
  assert.equal(canContinue({}, undefined), false);
});

test('pick uses the complete supplied view, skips watched, and avoids the last choice', () => {
  const movies = Array.from({ length: 30 }, (_, i) => ({ id: String(i) }));
  const marks = Object.fromEntries(movies.slice(0, 28).map(movie => [movie.id, { watched: true }]));
  assert.equal(pickMovie(movies, marks, '28').id, '29');
  assert.equal(pickMovie([movies[29]], marks, '29').id, '29');
  assert.equal(pickMovie(movies.slice(0, 28), marks), null);
  assert.equal(pickMovie([], marks), null);
});
