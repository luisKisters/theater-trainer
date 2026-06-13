import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeLineProgress,
  filterFillerTokens,
  normalizeToken,
} from '../../js/line-progress.js';

test('normalizes punctuation, case, umlauts, and sharp s', () => {
  assert.equal(normalizeToken('Über!'), 'ueber');
  assert.equal(normalizeToken('Straße,'), 'strasse');
  assert.equal(normalizeToken('Ähm'), 'aehm');
});

test('filters locked filler words', () => {
  assert.deepEqual(
    filterFillerTokens(['um', 'NochMal', 'warte', 'ähm', 'wirklich']),
    ['wirklich'],
  );
});

test('matches exact German line', () => {
  const result = analyzeLineProgress(
    'Aber natürlich.',
    'Aber natürlich.',
  );

  assert.equal(result.matchedRatio, 1);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.lastMatchedIndex, 1);
  assert.equal(result.finalWordsMatched, 2);
  assert.equal(result.isLikelyDone, true);
});

test('matches without punctuation sensitivity', () => {
  const result = analyzeLineProgress(
    'Darf ich bitten, Eisler, sich mit dem Gesicht gegen die Wand zu stellen?',
    'Darf ich bitten Eisler sich mit dem Gesicht gegen die Wand zu stellen',
  );

  assert.equal(result.matchedRatio, 1);
  assert.equal(result.isLikelyDone, true);
});

test('matches umlaut and sharp-s variants through aligner tolerance', () => {
  const result = analyzeLineProgress(
    'Natürlich weiß ich über die Straße Bescheid.',
    'Natuerlich weiss ich ueber die Strasse Bescheid',
  );

  assert.equal(result.matchedRatio, 1);
  assert.equal(result.finalWordsMatched, 7);
  assert.equal(result.isLikelyDone, true);
});

test('ignores filler words in transcript progress', () => {
  const result = analyzeLineProgress(
    'Ich konnte nicht anders handeln.',
    'um Ich uh konnte sorry nicht äh anders handeln',
  );

  assert.deepEqual(result.transcriptWords, ['Ich', 'konnte', 'nicht', 'anders', 'handeln']);
  assert.equal(result.matchedRatio, 1);
  assert.equal(result.isLikelyDone, true);
});

test('"let me think" filler does not create script mistakes', () => {
  const result = analyzeLineProgress(
    'Ich konnte nicht anders handeln.',
    'let me think',
  );

  assert.equal(result.matchedRatio, 0);
  assert.equal(result.matchedCount, 0);
  assert.equal(result.lastMatchedIndex, -1);
  assert.ok(result.aligned.every(entry => entry.spoken === null && !entry.matched));
  assert.equal(result.isLikelyDone, false);
});

test('one typo in a longer word is tolerated', () => {
  const result = analyzeLineProgress(
    'Die reinste Henkersmahlzeit.',
    'Die reinste Henkersmalzeit',
  );

  assert.equal(result.matchedRatio, 1);
  assert.equal(result.isLikelyDone, true);
});

test('85 percent coverage plus final words returns likely done', () => {
  const result = analyzeLineProgress(
    'one two three four five six seven',
    'one two four five six seven',
  );

  assert.equal(result.matchedCount, 6);
  assert.ok(result.matchedRatio >= 0.85);
  assert.ok(result.finalWordsMatched >= 3);
  assert.equal(result.isLikelyDone, true);
});

test('high coverage without final words does not return likely done', () => {
  const result = analyzeLineProgress(
    'one two three four five six seven eight nine ten',
    'one two three four five six seven eight nine',
  );

  assert.equal(result.matchedRatio, 0.9);
  assert.equal(result.finalWordsMatched, 0);
  assert.equal(result.isLikelyDone, false);
});

test('final word plus 90 percent coverage returns likely done', () => {
  const result = analyzeLineProgress(
    'one two three four five six seven eight nine ten',
    'one two three four five six seven eight ten',
  );

  assert.equal(result.matchedRatio, 0.9);
  assert.equal(result.finalWordsMatched, 1);
  assert.equal(result.isLikelyDone, true);
});

test('repeated earlier words do not regress progress', () => {
  const result = analyzeLineProgress(
    'alpha beta gamma delta epsilon',
    'alpha beta gamma alpha beta',
  );

  assert.equal(result.matchedCount, 3);
  assert.equal(result.lastMatchedIndex, 2);
  assert.equal(result.finalWordsMatched, 0);
  assert.equal(result.isLikelyDone, false);
});

test('wrong final words do not complete the line', () => {
  const result = analyzeLineProgress(
    'one two three four five six seven',
    'one two three four five wrong ending',
  );

  assert.equal(result.matchedCount, 5);
  assert.equal(result.finalWordsMatched, 0);
  assert.equal(result.isLikelyDone, false);
});
