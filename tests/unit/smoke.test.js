import { test } from 'node:test';
import assert from 'node:assert/strict';

test('trivial arithmetic', () => {
  assert.equal(1 + 1, 2);
});

test('string operations', () => {
  assert.equal('Theater Trainer'.toLowerCase(), 'theater trainer');
});

test('array operations', () => {
  const views = ['library', 'add', 'rehearse', 'settings'];
  assert.equal(views.length, 4);
  assert.ok(views.includes('rehearse'));
});
