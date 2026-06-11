import { alignWords } from './match.js';

const FILLER_WORDS = new Set([
  'um',
  'uh',
  'aeh',
  'aehm',
  'hm',
  'hmm',
  'wait',
  'sorry',
  'let',
  'me',
  'think',
  'nochmal',
  'warte',
  'entschuldigung',
]);

function tokenize(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

export function normalizeToken(token) {
  return String(token ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .trim();
}

export function filterFillerTokens(tokens) {
  return tokens.filter(token => {
    const normalized = normalizeToken(token);
    return normalized && !FILLER_WORDS.has(normalized);
  });
}

function countFinalWordsMatched(aligned) {
  let count = 0;
  for (let idx = aligned.length - 1; idx >= 0; idx--) {
    if (!aligned[idx].matched) break;
    count++;
  }
  return count;
}

function isLikelyComplete(expectedWords, matchedRatio, finalWordsMatched) {
  if (expectedWords.length === 0) return false;
  const requiredFinalWords = expectedWords.length >= 6 ? 3 : 2;
  if (matchedRatio >= 0.85 && finalWordsMatched >= requiredFinalWords) return true;
  return matchedRatio >= 0.90 && finalWordsMatched >= 1;
}

export function analyzeLineProgress(expectedText, transcriptText) {
  const expectedWords = tokenize(expectedText);
  const transcriptWords = filterFillerTokens(tokenize(transcriptText));
  const { aligned, matchedRatio } = alignWords(
    expectedWords.join(' '),
    transcriptWords.join(' '),
  );

  const matchedCount = aligned.filter(({ matched }) => matched).length;
  const lastMatchedIndex = aligned.reduce(
    (last, entry, index) => entry.matched ? index : last,
    -1,
  );
  const finalWordsMatched = countFinalWordsMatched(aligned);

  return {
    expectedWords,
    transcriptWords,
    aligned,
    matchedCount,
    matchedRatio,
    lastMatchedIndex,
    finalWordsMatched,
    isLikelyDone: isLikelyComplete(expectedWords, matchedRatio, finalWordsMatched),
  };
}
