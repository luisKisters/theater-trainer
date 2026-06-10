import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignWords } from '../../js/match.js';

test('exact match: all words matched, ratio = 1', () => {
  const { aligned, matchedRatio } = alignWords('Hello world foo', 'Hello world foo');
  assert.equal(aligned.length, 3);
  assert.ok(aligned.every(a => a.matched));
  assert.equal(matchedRatio, 1);
});

test('exact match single word', () => {
  const { aligned, matchedRatio } = alignWords('Hello', 'Hello');
  assert.equal(aligned.length, 1);
  assert.equal(aligned[0].matched, true);
  assert.equal(matchedRatio, 1);
});

test('missing word: one expected word not spoken', () => {
  const { aligned, matchedRatio } = alignWords('Hello world foo', 'Hello foo');
  assert.equal(aligned.length, 3);
  const helloEntry = aligned.find(a => a.word === 'Hello');
  const fooEntry = aligned.find(a => a.word === 'foo');
  assert.equal(helloEntry.matched, true);
  assert.equal(fooEntry.matched, true);
  // "world" is missing
  const worldEntry = aligned.find(a => a.word === 'world');
  assert.equal(worldEntry.matched, false);
  assert.ok(matchedRatio < 1);
});

test('extra word: spoken has extra word not in expected', () => {
  const { aligned, matchedRatio } = alignWords('Hello world', 'Hello big world');
  assert.equal(aligned.length, 2); // only expected words
  assert.equal(aligned[0].word, 'Hello');
  assert.equal(aligned[1].word, 'world');
  assert.ok(aligned.every(a => a.matched));
  assert.equal(matchedRatio, 1);
});

test('substitution: one wrong word shows as spoken=wrong, matched=false', () => {
  const { aligned, matchedRatio } = alignWords('Hello world', 'Hello earth');
  assert.equal(aligned.length, 2);
  assert.equal(aligned[0].matched, true);
  assert.equal(aligned[1].matched, false);
  assert.equal(aligned[1].spoken, 'earth');
  assert.equal(aligned[1].word, 'world');
  assert.ok(matchedRatio < 1);
});

test('multiple substitutions', () => {
  const { aligned, matchedRatio } = alignWords('one two three', 'ONE dos three');
  assert.equal(aligned.length, 3);
  assert.equal(aligned[0].matched, true); // "one" matches "ONE" (normalized)
  assert.equal(aligned[1].matched, false); // "two" vs "dos"
  assert.equal(aligned[1].spoken, 'dos');
  assert.equal(aligned[2].matched, true); // "three" matches "three"
  assert.equal(matchedRatio, 2 / 3);
});

test('reordering: words in different order — handled gracefully', () => {
  const { aligned, matchedRatio } = alignWords('hello world', 'world hello');
  assert.equal(aligned.length, 2);
  // LCS can match at most 1 word from a reordering
  assert.ok(matchedRatio <= 0.5 + Number.EPSILON);
  // No crash, all aligned entries have valid structure
  for (const a of aligned) {
    assert.ok('word' in a && 'matched' in a);
  }
});

test('punctuation tolerance: trailing punctuation ignored', () => {
  const { aligned } = alignWords('Hello, world!', 'Hello world');
  assert.ok(aligned.every(a => a.matched));
});

test('case insensitive matching', () => {
  const { aligned } = alignWords('Hello World', 'hello world');
  assert.ok(aligned.every(a => a.matched));
});

test('umlaut normalization: ä→ae, ö→oe, ü→ue, ß→ss', () => {
  const { aligned } = alignWords('über Straße', 'ueber Strasse');
  assert.ok(aligned.every(a => a.matched), 'umlauts should normalize to match');
});

test('edit-distance tolerance on long words (≥5 chars, 1 typo)', () => {
  const { aligned } = alignWords('theater theatre', 'theater teatre');
  // "theatre" vs "teatre" — both >= 5 chars, edit distance = 2? Let's check
  // Actually "theatre"(7) vs "teatre"(6): t-h-e-a-t-r-e vs t-e-a-t-r-e → distance 1 (delete h)
  assert.ok(aligned[1].matched, 'one-character difference on long word should match');
});

test('edit-distance tolerance does not match very different long words', () => {
  const { aligned } = alignWords('theater', 'example');
  // "theater" vs "example" — very different (distance >> 1)
  assert.equal(aligned[0].matched, false);
});

test('short words require exact match', () => {
  const { aligned } = alignWords('a on', 'a in');
  // "on" vs "in": both len < 5, no fuzzy match
  assert.equal(aligned[0].matched, true);  // "a" matches "a"
  assert.equal(aligned[1].matched, false); // "on" vs "in" — no fuzzy for short words
});

test('empty spoken: all expected words unmatched', () => {
  const { aligned, matchedRatio } = alignWords('Hello world', '');
  assert.equal(aligned.length, 2);
  assert.ok(aligned.every(a => !a.matched && a.spoken === null));
  assert.equal(matchedRatio, 0);
});

test('empty expected: returns empty aligned with ratio 1', () => {
  const { aligned, matchedRatio } = alignWords('', 'hello world');
  assert.equal(aligned.length, 0);
  assert.equal(matchedRatio, 1);
});

test('both empty: returns empty aligned with ratio 1', () => {
  const { aligned, matchedRatio } = alignWords('', '');
  assert.equal(aligned.length, 0);
  assert.equal(matchedRatio, 1);
});

test('matched entries include the original expected word, not normalized form', () => {
  const { aligned } = alignWords('Über', 'ueber');
  assert.equal(aligned[0].word, 'Über'); // original casing preserved
  assert.equal(aligned[0].matched, true);
});

test('matchedRatio is correct proportion', () => {
  const { matchedRatio } = alignWords('a b c d', 'a b x d');
  assert.equal(matchedRatio, 0.75); // 3 of 4 matched
});
