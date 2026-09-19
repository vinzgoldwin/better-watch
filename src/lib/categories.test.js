import assert from 'node:assert/strict';
import test from 'node:test';
import { readCategories, categoryKey, matchesCategories, buildCategoryOptions, UNCATEGORIZED } from './categories.js';

test('reads worker genre lists, trims whitespace, and deduplicates case-insensitively', () => {
  assert.deepEqual(readCategories({ genre: 'Virgin Humiliation, Financial Domination, Tease And Denial' }), ['Virgin Humiliation', 'Financial Domination', 'Tease And Denial']);
  assert.deepEqual(readCategories({ GENRE: 'Drama; drama | Comedy,  Science   Fiction ' }), ['drama', 'Comedy', 'Science Fiction']);
  assert.deepEqual(readCategories({}), []);
  assert.deepEqual(readCategories({ genre: ' , ; ' }), []);
});

test('selected categories use OR while no selection includes uncategorized movies', () => {
  const selected = ['Drama', 'Comedy'].map(categoryKey);
  assert.equal(matchesCategories({ categories: ['Drama'] }, selected), true);
  assert.equal(matchesCategories({ categories: ['Comedy', 'Thriller'] }, selected), true);
  assert.equal(matchesCategories({ categories: ['Thriller'] }, selected), false);
  assert.equal(matchesCategories({}, selected), false);
  assert.equal(matchesCategories({}, []), true);
  assert.equal(matchesCategories({}, [UNCATEGORIZED, categoryKey('Drama')]), true);
  assert.equal(matchesCategories({ categories: ['Drama'] }, [UNCATEGORIZED, categoryKey('Drama')]), true);
});

test('counts each movie once per category without treating folders as categories', () => {
  const options = buildCategoryOptions([
    { categories: ['Drama', 'drama', 'Comedy'] },
    { categories: ['Drama'] },
    { folder: 'Drama' }
  ]);
  assert.deepEqual(options, [
    { value: categoryKey('Comedy'), label: 'Comedy', count: 1 },
    { value: categoryKey('Drama'), label: 'Drama', count: 2 },
    { value: UNCATEGORIZED, label: 'Uncategorized', count: 1 }
  ]);
});
