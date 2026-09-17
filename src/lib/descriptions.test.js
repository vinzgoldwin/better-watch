import assert from 'node:assert/strict';
import test from 'node:test';
import { embeddedDescription } from './descriptions.js';

test('prefers description over comment and preserves paragraphs', () => {
  assert.equal(embeddedDescription({ description: ' Story\r\n\r\nMore. ', comment: 'Other' }), 'Story\n\nMore.');
});

test('falls back to comment for missing or blank descriptions, including uppercase tags', () => {
  assert.equal(embeddedDescription({ COMMENT: 'Fallback' }), 'Fallback');
  assert.equal(embeddedDescription({ DESCRIPTION: '  ', COMMENT: 'Fallback' }), 'Fallback');
});

test('missing or unusable metadata has no description', () => {
  assert.equal(embeddedDescription(), null);
  assert.equal(embeddedDescription({ description: 42, comment: '\n ' }), null);
});
