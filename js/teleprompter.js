import { alignWords } from './match.js';

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tokenize(str) {
  return str.trim().split(/\s+/).filter(w => w.length > 0);
}

function wordsMatchLoose(a, b) {
  return a.toLowerCase()
    .replace(/[.,!?;:'"()\-—…«»„"‘’“”]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .trim() === b.toLowerCase()
    .replace(/[.,!?;:'"()\-—…«»„"‘’“”]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .trim();
}

function matchedPrefixLength(expected, spoken) {
  const exp = tokenize(expected);
  const spk = tokenize(spoken);
  let matched = 0;
  for (const word of spk) {
    if (matched >= exp.length) break;
    if (wordsMatchLoose(exp[matched], word)) matched++;
  }
  return matched;
}

function hiddenDashes(word) {
  const len = Math.max(2, word.replace(/[.,!?;:'"()]/g, '').length);
  return '▁'.repeat(len);
}

/**
 * Creates a teleprompter bound to containerEl.
 * @param {HTMLElement} containerEl - the scene-inner element
 * @param {object} script - script with lines[] and characters[]
 * @param {string} userRoleId - character_id the user is playing
 * @returns {object} controller
 */
export function createTeleprompter(containerEl, script, userRoleId, options = {}) {
  const lines = script.lines;

  let lineIndex = 0;
  let wordPtr = 0;     // index of next word the user should say in the active mine line
  let revealedTo = 0;  // how many words have been peeked (hint revealed)
  let partnerWords = 0; // how many words shown for active partner line
  let wordStates = [];  // aligned correction states after finalizeTurn
  let turnFinalized = false;
  const lineHistory = new Map(); // lineIndex → wordStates, persists corrections in context
  const compactNotes = new Map(); // lineIndex → summary of skipped context

  function isUserLine(line) {
    return line.character_id === userRoleId;
  }

  function currentLine() {
    return lineIndex < lines.length ? lines[lineIndex] : null;
  }

  function characterName(line) {
    const c = script.characters.find(ch => ch.id === line.character_id);
    return c ? c.name : line.character_id;
  }

  function lineClasses(idx) {
    const l = lines[idx];
    const role = isUserLine(l) ? 'mine' : 'partner';
    const pos = idx < lineIndex ? 'context' : idx === lineIndex ? 'active' : 'future';
    return `line ${role} ${pos}`;
  }

  function renderUserActiveLine(line) {
    const words = tokenize(line.text);
    if (turnFinalized && wordStates.length > 0) {
      return wordStates.map(({ word, spoken, matched }) => {
        if (matched) return `<span class="w said">${escHtml(word)}</span>`;
        if (spoken) return `<s class="wrong">${escHtml(spoken)}</s><span class="fix">${escHtml(word)}</span>`;
        return `<span class="w said">${escHtml(word)}</span>`;
      }).join(' ');
    }

    return words.map((w, idx) => {
      const cur = idx === wordPtr ? ' cur' : '';
      if (idx < wordPtr) return `<span class="w said">${escHtml(w)}</span>`;
      if (idx < revealedTo) return `<span class="w hint${cur}">${escHtml(w)}</span>`;
      return `<span class="w hidden${cur}">${escHtml(hiddenDashes(w))}</span>`;
    }).join(' ');
  }

  function renderPartnerActiveLine(line) {
    const words = tokenize(line.text);
    return words.slice(0, partnerWords).map(w => escHtml(w)).join(' ');
  }

  function renderContextLine(line, idx) {
    if (isUserLine(line)) {
      const hist = lineHistory.get(idx);
      if (hist && hist.length > 0) {
        return hist.map(({ word, spoken, matched }) => {
          if (matched) return `<span class="w said">${escHtml(word)}</span>`;
          if (spoken) return `<s class="wrong">${escHtml(spoken)}</s><span class="fix">${escHtml(word)}</span>`;
          return `<span class="w said">${escHtml(word)}</span>`;
        }).join(' ');
      }
      return tokenize(line.text).map(w => `<span class="w said">${escHtml(w)}</span>`).join(' ');
    }
    return escHtml(line.text);
  }

  function renderFutureLine(line) {
    return isUserLine(line) ? '▁▁▁▁  ▁▁▁  ▁▁▁▁▁' : '▁▁▁▁  ▁▁▁▁▁▁  ▁▁▁';
  }

  function render() {
    const html = lines.map((line, idx) => {
      let body;
      if (idx < lineIndex) {
        body = renderContextLine(line, idx);
      } else if (idx === lineIndex) {
        body = isUserLine(line) ? renderUserActiveLine(line) : renderPartnerActiveLine(line);
      } else {
        body = renderFutureLine(line);
      }
      const isDone = idx === lineIndex && !isUserLine(line) && partnerWords >= tokenize(line.text).length;
      const note = compactNotes.get(idx);
      return `${note ? `<div class="compact-note" data-idx="${idx}">${escHtml(note)}</div>` : ''}<div class="${lineClasses(idx)}${isDone ? ' done' : ''}" data-idx="${idx}">
        <div class="who">${escHtml(characterName(line))}</div>
        <div class="body">${body}</div>
      </div>`;
    }).join('');

    containerEl.innerHTML = html;

    const activeEl = containerEl.querySelector('.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    options.onStateChange?.(controller.getState());
  }

  function resetLineState() {
    wordPtr = 0;
    revealedTo = 0;
    partnerWords = 0;
    wordStates = [];
    turnFinalized = false;
  }

  const controller = {
    render,

    /** Reveal the next word as a hint (space key). Returns false if nothing to peek. */
    peek() {
      const line = currentLine();
      if (!line || !isUserLine(line)) return false;
      const words = tokenize(line.text);
      if (revealedTo >= words.length) return false;
      revealedTo++;
      render();
      return true;
    },

    /** Stream the next partner word into the active partner line. */
    streamPartnerWord() {
      const line = currentLine();
      if (!line || isUserLine(line)) return;
      const words = tokenize(line.text);
      if (partnerWords < words.length) { partnerWords++; render(); }
    },

    /** Reveal partner progress by matching the model transcript against the current script line. */
    streamPartnerText(text) {
      const line = currentLine();
      if (!line || isUserLine(line)) return;
      partnerWords = Math.max(partnerWords, matchedPrefixLength(line.text, text));
      render();
    },

    /** Called when the partner finishes speaking. Updates display, does not auto-advance. */
    partnerTurnComplete() {
      const line = currentLine();
      if (!line || isUserLine(line)) return;
      partnerWords = tokenize(line.text).length;
      render();
    },

    /**
     * Called with the full spoken transcript when the user's turn ends.
     * Runs deterministic alignment and renders corrections. Does not auto-advance.
     */
    finalizeTurn(spokenText) {
      const line = currentLine();
      if (!line || !isUserLine(line)) return;
      const { aligned } = alignWords(line.text, spokenText);
      wordStates = aligned;
      lineHistory.set(lineIndex, aligned); // persist so corrections show in context
      turnFinalized = true;
      wordPtr = tokenize(line.text).length;
      revealedTo = wordPtr;
      render();
    },

    /** Advance to the next line. */
    nextLine() {
      if (lineIndex < lines.length - 1) {
        lineIndex++;
        resetLineState();
        render();
      }
    },

    /** Skip ahead to the cue just before the next user line, keeping two prompt lines visible. */
    compactToNextUserTurn(promptLines = 2) {
      const nextUserIndex = lines.findIndex((line, idx) => idx > lineIndex && isUserLine(line));
      if (nextUserIndex < 0) return null;

      const startIndex = Math.max(0, nextUserIndex - promptLines);
      const skipped = lines.slice(lineIndex, startIndex);
      if (skipped.length === 0) return null;

      const speakerNames = [...new Set(skipped.map(characterName))].join(', ');
      const summary = `${skipped.length} skipped line${skipped.length === 1 ? '' : 's'} from ${speakerNames || 'earlier speakers'} before your cue.`;
      lineIndex = startIndex;
      compactNotes.set(lineIndex, summary);
      resetLineState();
      render();
      return { startLineIndex: lineIndex, skippedLines: skipped.length, summary };
    },

    /** Go back to the previous line. */
    prevLine() {
      if (lineIndex > 0) {
        lineIndex--;
        resetLineState();
        render();
      }
    },

    /** Restart from the beginning. */
    restart() {
      lineIndex = 0;
      lineHistory.clear();
      resetLineState();
      render();
    },

    /** True when the current line belongs to the user. */
    isUserTurn() {
      const line = currentLine();
      return !!line && isUserLine(line);
    },

    /** True when all lines have been completed. */
    isDone() {
      return lineIndex >= lines.length;
    },

    /** Returns internal state snapshot for testing. */
    getState() {
      const totalWords = lines.reduce((sum, line) => sum + tokenize(line.text).length, 0);
      const completedWords = lines.slice(0, lineIndex).reduce((sum, line) => sum + tokenize(line.text).length, 0);
      const active = currentLine();
      const activeWords = active
        ? isUserLine(active)
          ? wordPtr
          : partnerWords
        : 0;
      const processedWords = Math.min(totalWords, completedWords + activeWords);
      const progress = totalWords > 0 ? processedWords / totalWords : 1;
      return { lineIndex, wordPtr, revealedTo, partnerWords, turnFinalized, totalWords, processedWords, progress };
    },
  };

  render();
  return controller;
}
