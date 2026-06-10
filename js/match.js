function tokenize(str) {
  return str.trim().split(/\s+/).filter(w => w.length > 0);
}

function normalize(word) {
  return word
    .toLowerCase()
    .replace(/[.,!?;:'"()\-—…«»„"‘’“”]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ïî]/g, 'i')
    .replace(/[ùû]/g, 'u').replace(/ç/g, 'c')
    .trim();
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

function wordsMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 5 && nb.length >= 5 && editDistance(na, nb) <= 1) return true;
  return false;
}

/**
 * Aligns spoken words to expected words using LCS.
 * Returns { aligned, matchedRatio } where aligned is an array of
 * { word (expected), spoken (what was said or null), matched (bool) }.
 */
export function alignWords(expected, spoken) {
  const exp = tokenize(expected);
  const spk = tokenize(spoken);

  if (exp.length === 0) return { aligned: [], matchedRatio: 1 };
  if (spk.length === 0) {
    return {
      aligned: exp.map(w => ({ word: w, spoken: null, matched: false })),
      matchedRatio: 0,
    };
  }

  const m = exp.length, n = spk.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = wordsMatch(exp[i - 1], spk[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to find LCS matched pairs
  const expMatchedBy = new Map();
  const spkMatched = new Set();
  {
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (wordsMatch(exp[i - 1], spk[j - 1])) {
        expMatchedBy.set(i - 1, j - 1);
        spkMatched.add(j - 1);
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
  }

  // Pair remaining unmatched exp words with unmatched spk words (substitutions)
  const unmatchedExp = [];
  const unmatchedSpk = [];
  for (let i = 0; i < m; i++) {
    if (!expMatchedBy.has(i)) unmatchedExp.push(i);
  }
  for (let j = 0; j < n; j++) {
    if (!spkMatched.has(j)) unmatchedSpk.push(j);
  }

  const expSubstBy = new Map();
  for (let k = 0; k < Math.min(unmatchedExp.length, unmatchedSpk.length); k++) {
    expSubstBy.set(unmatchedExp[k], unmatchedSpk[k]);
  }

  const aligned = exp.map((w, i) => {
    if (expMatchedBy.has(i)) {
      return { word: w, spoken: spk[expMatchedBy.get(i)], matched: true };
    }
    if (expSubstBy.has(i)) {
      return { word: w, spoken: spk[expSubstBy.get(i)], matched: false };
    }
    return { word: w, spoken: null, matched: false };
  });

  const matchedRatio = aligned.filter(a => a.matched).length / m;
  return { aligned, matchedRatio };
}
