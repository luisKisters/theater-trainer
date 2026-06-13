import { test, expect } from '@playwright/test';

// Script where the user (alice) has the FIRST line so the teleprompter starts on their line
const FIXTURE_SCRIPT = {
  title: 'Teleprompter Test Scene',
  author: 'Test',
  language: 'en',
  characters: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ],
  lines: [
    { character_id: 'alice', text: 'Hello Bob how are you today.' },
    { character_id: 'bob', text: 'I am doing well thank you.' },
    { character_id: 'alice', text: 'That is wonderful to hear.' },
  ],
};

const LONG_FIXTURE_SCRIPT = {
  title: 'Long Teleprompter Test Scene',
  author: 'Test',
  language: 'en',
  characters: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ],
  lines: [
    { character_id: 'alice', text: 'one two three four five six seven eight nine ten eleven twelve.' },
    { character_id: 'bob', text: 'Partner line follows.' },
  ],
};

async function setupRehearse(page, script = FIXTURE_SCRIPT) {
  await page.addInitScript(([script]) => {
    function makeEmitter() {
      const h = {};
      return {
        on(e, fn) { (h[e] = h[e] || []).push(fn); },
        _emit(e, d) { (h[e] || []).slice().forEach(fn => fn(d)); },
      };
    }

    window.__TT_BACKENDS__ = {
      scriptProcessor: { process: async () => JSON.parse(JSON.stringify(script)) },
      liveBackend: {
        ...makeEmitter(),
        async connect() { this._emit('connected'); },
        disconnect() { this._emit('disconnected'); },
        sendAudio() {},
        sendText() {},
      },
      audioIO: {
        async startMic() {},
        stopMic() {},
        play() {},
        flush() {},
        stop() {},
      },
    };
  }, [script]);

  // Set API key so Rehearse is not blocked
  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key');
  await page.click('#btn-save-settings');

  // Add script via mock processor
  await page.goto('/#add');
  await page.fill('#paste-input', 'placeholder');
  await page.click('#btn-process');
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 5000 });

  // Open script, pick role alice
  await page.click('.btn-open-script');
  await expect(page.locator('#role-picker-dialog')).toBeVisible();
  await page.click('[data-role-id="alice"]');
  await expect(page.locator('#view-rehearse')).toHaveClass(/active/, { timeout: 3000 });

  // Wait for teleprompter controller to be exposed
  await page.waitForFunction(() => window.__TT_TEST__ !== null && window.__TT_TEST__ !== undefined, { timeout: 5000 });
}

async function startRehearsal(page) {
  await page.click('#btn-start');
  await expect(page.locator('#btn-reveal-word')).toBeEnabled();
}

test('teleprompter initial state: user line words are hidden', async ({ page }) => {
  await setupRehearse(page);
  const hiddenWords = page.locator('#scene-inner .line.mine.active .body .w.hidden');
  await expect(hiddenWords.first()).toBeVisible();
  // Should have at least one hidden word
  const count = await hiddenWords.count();
  expect(count).toBeGreaterThan(0);
});

test('teleprompter: active user line shows one blank per actual word', async ({ page }) => {
  await setupRehearse(page);

  const expectedWords = FIXTURE_SCRIPT.lines[0].text.trim().split(/\s+/);
  const hiddenWords = page.locator('#scene-inner .line.mine.active .body .w.hidden');

  await expect(hiddenWords).toHaveCount(expectedWords.length);
});

test('teleprompter: blank lengths correspond to actual script word lengths', async ({ page }) => {
  await setupRehearse(page);

  const expectedLengths = FIXTURE_SCRIPT.lines[0].text
    .trim()
    .split(/\s+/)
    .map(word => Math.max(2, word.replace(/[^\p{Letter}\p{Number}]/gu, '').length));

  const blankLengths = await page
    .locator('#scene-inner .line.mine.active .body .w.hidden')
    .evaluateAll(elements => elements.map(el => Number(el.dataset.wordLength)));

  expect(blankLengths).toEqual(expectedLengths);
});

test('teleprompter: future lines show one blank per actual word', async ({ page }) => {
  await setupRehearse(page);

  const expectedWords = FIXTURE_SCRIPT.lines[1].text.trim().split(/\s+/);
  const futureBlanks = page.locator('#scene-inner .line.partner.future .body .future-blank');

  await expect(futureBlanks).toHaveCount(expectedWords.length);
});

test('teleprompter: space key reveals first word as hint', async ({ page }) => {
  await setupRehearse(page);

  // Before space: first word should be hidden+cur, not hint
  const firstWord = page.locator('#scene-inner .line.mine.active .body .w').first();
  await expect(firstWord).toHaveClass(/hidden/);

  // Press space
  await page.keyboard.press('Space');

  // After space: first word should be hint
  await expect(firstWord).toHaveClass(/hint/);
  await expect(firstWord).not.toHaveClass(/hidden/);
});

test('teleprompter: reveal follows spoken progress beyond manual hints', async ({ page }) => {
  await setupRehearse(page, LONG_FIXTURE_SCRIPT);
  await startRehearsal(page);

  await page.click('#btn-reveal-word');
  await page.click('#btn-reveal-word');
  await page.click('#btn-reveal-word');
  await expect(page.locator('#scene-inner .line.mine.active .body .w.hint')).toHaveText(['one', 'two', 'three']);

  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('one two three four five six seven eight nine ten'));
  await page.click('#btn-reveal-word');

  const body = page.locator('#scene-inner .line.mine.active .body');
  await expect(body.locator('.w.said')).toHaveText([
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
  ]);
  await expect(body.locator('.w.hint')).toHaveText(['eleven']);
  await expect(body.locator('.w.hidden')).toHaveText(['▁▁▁▁▁▁']);
});

test('teleprompter: regressed transcript does not move reveal backwards', async ({ page }) => {
  await setupRehearse(page, LONG_FIXTURE_SCRIPT);
  await startRehearsal(page);

  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('one two three four five six seven eight nine ten'));
  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('one two three'));
  await page.click('#btn-reveal-word');

  const state = await page.evaluate(() => window.__TT_TEST__.getState());
  expect(state.latestLiveLastMatchedIndex).toBe(9);
  expect(state.revealedTo).toBe(11);
  await expect(page.locator('#scene-inner .line.mine.active .body .w.hint').last()).toHaveText('eleven');
});

test('teleprompter: space and reveal button use the same path', async ({ page }) => {
  await setupRehearse(page);
  await startRehearsal(page);

  await page.keyboard.press('Space');
  const afterSpace = await page.locator('#scene-inner .line.mine.active .body').innerHTML();
  const spaceState = await page.evaluate(() => window.__TT_TEST__.getState());

  await page.evaluate(() => window.__TT_TEST__.restart());
  await page.click('#btn-reveal-word');
  const afterButton = await page.locator('#scene-inner .line.mine.active .body').innerHTML();
  const buttonState = await page.evaluate(() => window.__TT_TEST__.getState());

  expect(afterButton).toBe(afterSpace);
  expect(buttonState.revealedTo).toBe(spaceState.revealedTo);
});

test('teleprompter: live transcript fills matched words before finalization', async ({ page }) => {
  await setupRehearse(page);

  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('Hello Bob how'));

  const body = page.locator('#scene-inner .line.mine.active .body');
  await expect(body.locator('.w.said')).toHaveText(['Hello', 'Bob', 'how']);
  await expect(body.locator('.w.hidden')).toHaveCount(3);
  await expect(body.locator('s.wrong')).toHaveCount(0);
  await expect(body.locator('.fix')).toHaveCount(0);
});

test('teleprompter: Heard text updates as transcript changes', async ({ page }) => {
  await setupRehearse(page);

  await expect(page.locator('#live-transcript')).toContainText('Heard:');
  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('Hello Bob'));
  await expect(page.locator('#live-transcript')).toContainText('Heard: Hello Bob');

  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('Hello Bob how are'));
  await expect(page.locator('#live-transcript')).toContainText('Heard: Hello Bob how are');
});

test('teleprompter: filler transcript does not fill script words', async ({ page }) => {
  await setupRehearse(page);

  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('um let me think'));

  const body = page.locator('#scene-inner .line.mine.active .body');
  await expect(body.locator('.w.said')).toHaveCount(0);
  await expect(body.locator('.w.hidden')).toHaveCount(6);
  await expect(page.locator('#live-transcript')).toContainText('Heard: um let me think');
});

test('teleprompter: wrong live words do not show red correction before finalization', async ({ page }) => {
  await setupRehearse(page);

  await page.evaluate(() => window.__TT_TEST__.updateLiveTranscript('Hello Bob how are you tomorrow.'));

  const body = page.locator('#scene-inner .line.mine.active .body');
  await expect(body.locator('s.wrong')).toHaveCount(0);
  await expect(body.locator('.fix')).toHaveCount(0);
  await expect(body.locator('.w.said')).toHaveText(['Hello', 'Bob', 'how', 'are', 'you']);
  await expect(body.locator('.w.hidden')).toHaveCount(1);
});

test('teleprompter: finalizeTurn with exact text marks all words as said', async ({ page }) => {
  await setupRehearse(page);

  await page.evaluate(() => window.__TT_TEST__.finalizeTurn('Hello Bob how are you today.'));

  const body = page.locator('#scene-inner .line.mine.active .body');
  // All words should be .said
  const hiddenWords = body.locator('.w.hidden');
  const hintWords = body.locator('.w.hint');
  await expect(hiddenWords).toHaveCount(0);
  await expect(hintWords).toHaveCount(0);

  const saidWords = body.locator('.w.said');
  const count = await saidWords.count();
  expect(count).toBeGreaterThan(0);
});

test('teleprompter: finalizeTurn with wrong word shows strikethrough correction', async ({ page }) => {
  await setupRehearse(page);

  // User says "tomorrow" instead of "today"
  await page.evaluate(() => window.__TT_TEST__.finalizeTurn('Hello Bob how are you tomorrow.'));

  const body = page.locator('#scene-inner .line.mine.active .body');

  // Should have a strikethrough with the wrong word
  const wrongEl = body.locator('s.wrong');
  await expect(wrongEl).toBeVisible();
  await expect(wrongEl).toContainText('tomorrow');

  // Should have a fix box with the correct word
  const fixEl = body.locator('.fix');
  await expect(fixEl).toBeVisible();
  await expect(fixEl).toContainText('today');
});

test('teleprompter: partner line shows future placeholder initially', async ({ page }) => {
  await setupRehearse(page);

  // Second line (Bob's) should be .future
  const futureLine = page.locator('#scene-inner .line.partner.future');
  await expect(futureLine).toBeVisible();
});

test('teleprompter: nextLine advances to partner line', async ({ page }) => {
  await setupRehearse(page);

  await page.evaluate(() => window.__TT_TEST__.nextLine());

  // Bob's line should now be active
  await expect(page.locator('#scene-inner .line.partner.active')).toBeVisible();
  // Alice's first line should now be context
  await expect(page.locator('#scene-inner .line.mine.context')).toBeVisible();
});

test('teleprompter: prevLine goes back to previous line', async ({ page }) => {
  await setupRehearse(page);

  await page.evaluate(() => window.__TT_TEST__.nextLine());
  await expect(page.locator('#scene-inner .line.partner.active')).toBeVisible();

  await page.evaluate(() => window.__TT_TEST__.prevLine());
  await expect(page.locator('#scene-inner .line.mine.active')).toBeVisible();
});

test('teleprompter: restart resets to first line', async ({ page }) => {
  await setupRehearse(page);

  // Advance two lines
  await page.evaluate(() => {
    window.__TT_TEST__.nextLine();
    window.__TT_TEST__.nextLine();
  });

  // Third line (alice) should be active
  await expect(page.locator('#scene-inner .line.mine.active')).toBeVisible();
  const state = await page.evaluate(() => window.__TT_TEST__.getState());
  expect(state.lineIndex).toBe(2);

  // Restart
  await page.evaluate(() => window.__TT_TEST__.restart());

  const stateAfter = await page.evaluate(() => window.__TT_TEST__.getState());
  expect(stateAfter.lineIndex).toBe(0);
  await expect(page.locator('#scene-inner .line.mine.active')).toBeVisible();
});

test('teleprompter: multiple wrong words show multiple corrections', async ({ page }) => {
  await setupRehearse(page);

  // User says "Hi" instead of "Hello" (short words, exact match needed) and "tomorrow" instead of "today"
  await page.evaluate(() => window.__TT_TEST__.finalizeTurn('Hi Bob how are you tomorrow.'));

  const body = page.locator('#scene-inner .line.mine.active .body');
  const corrections = body.locator('s.wrong');
  const fixes = body.locator('.fix');

  const correctionCount = await corrections.count();
  expect(correctionCount).toBeGreaterThanOrEqual(1);
  const fixCount = await fixes.count();
  expect(fixCount).toBe(correctionCount);
});

test('teleprompter: space does not reveal when not user turn', async ({ page }) => {
  await setupRehearse(page);

  // Advance to Bob's line
  await page.evaluate(() => window.__TT_TEST__.nextLine());

  const partnerBody = page.locator('#scene-inner .line.partner.active .body');
  const beforeText = await partnerBody.innerText();

  // Press space - should not peek (not user's turn)
  await page.keyboard.press('Space');

  const afterText = await partnerBody.innerText();
  expect(beforeText).toBe(afterText);
});

test('teleprompter: reveal button does nothing on partner turns', async ({ page }) => {
  await setupRehearse(page);
  await startRehearsal(page);
  await page.evaluate(() => window.__TT_TEST__.nextLine());

  const partnerBody = page.locator('#scene-inner .line.partner.active .body');
  const beforeText = await partnerBody.innerText();
  const beforeState = await page.evaluate(() => window.__TT_TEST__.getState());

  await page.click('#btn-reveal-word');

  const afterText = await partnerBody.innerText();
  const afterState = await page.evaluate(() => window.__TT_TEST__.getState());
  expect(afterText).toBe(beforeText);
  expect(afterState.revealedTo).toBe(beforeState.revealedTo);
  expect(afterState.lineIndex).toBe(beforeState.lineIndex);
});
