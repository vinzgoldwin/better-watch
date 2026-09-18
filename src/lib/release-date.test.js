import assert from 'node:assert/strict';
import test from 'node:test';
import { readReleaseDate, formatReleaseDate, compareReleaseDates } from './release-date.js';

test('reads release metadata without confusing encoding timestamps with release dates', () => {
  assert.equal(readReleaseDate({ date: '2025-03-01', creation_time: '2026-01-01T00:00:00Z' }), '2025-03-01');
  assert.equal(readReleaseDate({ RELEASE_DATE: '2024-02-29', date: '2025-03-01' }), '2024-02-29');
  assert.equal(readReleaseDate({ creation_time: '2025-03-01T00:00:00Z' }), null);
  assert.equal(readReleaseDate(), null);
});

test('rejects invalid dates and preserves partial date precision', () => {
  assert.equal(readReleaseDate({ date: '2025-02-29' }), null);
  assert.equal(readReleaseDate({ date: 'unknown' }), null);
  assert.equal(readReleaseDate({ date: '2025-13' }), null);
  assert.equal(readReleaseDate({ year: '2025' }), '2025');
  assert.equal(formatReleaseDate('2025'), '2025');
  assert.equal(formatReleaseDate('2025-03'), 'Mar 2025');
  assert.equal(formatReleaseDate('2025-03-01'), 'Mar 1, 2025');
});

test('sorts releases in either direction with missing dates last and title tie breaks', () => {
  const movies = [{ title: 'Missing' }, { title: 'New', releaseDate: '2025-03-01' }, { title: 'Old', releaseDate: '2024-01-01' }, { title: 'Also new', releaseDate: '2025-03-01' }];
  assert.deepEqual(movies.toSorted(compareReleaseDates).map(m => m.title), ['Also new', 'New', 'Old', 'Missing']);
  assert.deepEqual(movies.toSorted((a, b) => compareReleaseDates(a, b, true)).map(m => m.title), ['Old', 'Also new', 'New', 'Missing']);
});
