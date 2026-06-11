import { test, expect } from '@playwright/test';

// User plays Alice; Bob is the AI partner.
const FIXTURE_SCRIPT = {
  title: 'Rehearse Test Scene',
  author: 'Test',
  language: 'en',
  characters: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob',   name: 'Bob'   },
  ],
  lines: [
    { character_id: 'alice', text: 'Hello Bob how are you today.' },
    { character_id: 'bob',   text: 'I am doing well thank you.'  },
    { character_id: 'alice', text: 'That is wonderful to hear.'  },
  ],
};

// Inject mock backends before page load and return the fixture so the test can
// call trigger methods from page.evaluate().
function injectMocks(script) {
  return ([fixture]) => {
    // Minimal event-emitter shared by both mocks
    function makeEmitter() {
      const h = {};
      return {
        _h: h,
        on(e, fn) { (h[e] = h[e] || []).push(fn); },
        off(e, fn) { if (h[e]) h[e] = h[e].filter(x => x !== fn); },
        _emit(e, d) { (h[e] || []).slice().forEach(f => f(d)); },
      };
    }

    const lb = {
      ...makeEmitter(),
      connected: false,
      sentTexts: [],
      async connect() { this.connected = true; this._emit('connected'); },
      disconnect() { this.connected = false; this._emit('disconnected'); },
      sendAudio() {},
      sendText(text) { this.sentTexts.push(text); this._emit('clientText', { text }); },
      triggerInputTranscription(text) { this._emit('inputTranscription', { text }); },
      triggerOutputTranscription(text) { this._emit('outputTranscription', { text }); },
      triggerAudio(data) { this._emit('audio', { data: data || 'AAAA' }); },
      triggerTurnComplete() { this._emit('turnComplete'); },
      triggerInterrupted() { this._emit('interrupted'); },
    };

    const aio = {
      _micStarted: false,
      _played: [],
      _flushed: false,
      async startMic(cb) { this._micStarted = true; this._cb = cb; },
      stopMic() { this._micStarted = false; },
      play(d) { this._played.push(d); },
      flush() { this._flushed = true; this._played = []; },
      stop() { this.stopMic(); this.flush(); },
      get micStarted() { return this._micStarted; },
    };

    window.__TT_BACKENDS__ = {
      scriptProcessor: { process: async () => JSON.parse(JSON.stringify(fixture)) },
      liveBackend: lb,
      audioIO: aio,
    };
  };
}

async function setupRehearseWithLive(page, script = FIXTURE_SCRIPT) {
  await page.addInitScript(injectMocks(script), [script]);

  // Persist API key so Rehearse is not blocked
  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key');
  await page.click('#btn-save-settings');

  // Process script via mock processor
  await page.goto('/#add');
  await page.fill('#paste-input', 'placeholder');
  await page.click('#btn-process');
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 5000 });

  // Open script → pick role alice → land on Rehearse
  await page.click('.btn-open-script');
  await expect(page.locator('#role-picker-dialog')).toBeVisible();
  await page.click('[data-role-id="alice"]');
  await expect(page.locator('#view-rehearse')).toHaveClass(/active/, { timeout: 3000 });

  // Wait for teleprompter to be ready
  await page.waitForFunction(() => window.__TT_TEST__ != null, { timeout: 5000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('Start connects backend and enables Pause', async ({ page }) => {
  await setupRehearseWithLive(page);

  // Initially: Start enabled, Pause disabled
  await expect(page.locator('#btn-start')).toBeEnabled();
  await expect(page.locator('#btn-pause')).toBeDisabled();

  await page.click('#btn-start');

  // After Start: Start disabled, Pause enabled, mic started
  await expect(page.locator('#btn-start')).toBeDisabled();
  await expect(page.locator('#btn-pause')).toBeEnabled();

  const micStarted = await page.evaluate(() => window.__TT_BACKENDS__.audioIO.micStarted);
  expect(micStarted).toBe(true);
});

test('Start sends an initial cue when the first active line belongs to the partner', async ({ page }) => {
  const partnerFirstFixture = {
    title: 'Partner First Scene',
    author: 'Test',
    language: 'en',
    characters: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    lines: [
      { character_id: 'bob', text: 'Your cue begins now.' },
      { character_id: 'alice', text: 'I am ready.' },
    ],
  };

  await setupRehearseWithLive(page, partnerFirstFixture);
  await page.click('#btn-start');

  const sentTexts = await page.evaluate(() => window.__TT_BACKENDS__.liveBackend.sentTexts);
  expect(sentTexts).toHaveLength(1);
  expect(sentTexts[0]).toContain('Bob: Your cue begins now.');
});

test('Pause stops mic and re-enables Start', async ({ page }) => {
  await setupRehearseWithLive(page);

  await page.click('#btn-start');
  await expect(page.locator('#btn-pause')).toBeEnabled();

  await page.click('#btn-pause');

  await expect(page.locator('#btn-start')).toBeEnabled();
  await expect(page.locator('#btn-pause')).toBeDisabled();

  const micStarted = await page.evaluate(() => window.__TT_BACKENDS__.audioIO.micStarted);
  expect(micStarted).toBe(false);
});

test('Wrong word from user shows deterministic strike+box correction', async ({ page }) => {
  await setupRehearseWithLive(page);
  await page.click('#btn-start');

  // Simulate user saying "tomorrow" instead of "today"
  await page.evaluate(() => {
    window.__TT_BACKENDS__.liveBackend.triggerInputTranscription('Hello Bob how are you tomorrow.');
  });

  // Trigger output transcription — this signals user turn ended and causes finalizeTurn
  await page.evaluate(() => {
    window.__TT_BACKENDS__.liveBackend.triggerOutputTranscription('I am doing well thank you.');
  });

  // After finalizeTurn + nextLine, Alice's line is now in context (lineIndex=1 → Bob active)
  // The lineHistory stores corrections so they persist in context rendering
  const contextBody = page.locator('#scene-inner .line.mine.context .body');
  await expect(contextBody.locator('s.wrong')).toBeVisible({ timeout: 3000 });
  await expect(contextBody.locator('s.wrong')).toContainText('tomorrow');
  await expect(contextBody.locator('.fix')).toContainText('today');
});

test('Partner output transcription streams words into active partner line', async ({ page }) => {
  await setupRehearseWithLive(page);
  await page.click('#btn-start');

  // User turn
  await page.evaluate(() => {
    window.__TT_BACKENDS__.liveBackend.triggerInputTranscription('Hello Bob how are you today.');
  });

  // Partner output starts → advances to Bob's line and streams words
  await page.evaluate(() => {
    window.__TT_BACKENDS__.liveBackend.triggerOutputTranscription('I am doing well thank you.');
  });

  // Bob's line should now be active
  await expect(page.locator('#scene-inner .line.partner.active')).toBeVisible({ timeout: 3000 });

  // Partner words should be streaming (at least some visible)
  const partnerBody = page.locator('#scene-inner .line.partner.active .body');
  await expect(partnerBody).not.toBeEmpty();
});

test('progress bar tracks matched partner transcript against the script', async ({ page }) => {
  await setupRehearseWithLive(page);
  await page.click('#btn-start');

  await page.evaluate(() => {
    const lb = window.__TT_BACKENDS__.liveBackend;
    lb.triggerInputTranscription('Hello Bob how are you today.');
    lb.triggerOutputTranscription('I am doing well thank you.');
  });

  const state = await page.evaluate(() => window.__TT_TEST__.getState());
  expect(state.processedWords).toBeGreaterThan(6);
  await expect(page.locator('#script-progress-label')).toContainText(/\d+%/);
  await expect(page.locator('#script-progress-fill')).toHaveAttribute('style', /width: [1-9]\d*%/);
});

test('compact to cue skips earlier partner-only material and keeps two prompts before user turn', async ({ page }) => {
  const compactFixture = {
    title: 'Cue Test Scene',
    author: 'Test',
    language: 'en',
    characters: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    lines: [
      { character_id: 'bob', text: 'First setup line.' },
      { character_id: 'bob', text: 'Second setup line.' },
      { character_id: 'bob', text: 'Third setup line.' },
      { character_id: 'bob', text: 'First cue line.' },
      { character_id: 'bob', text: 'Second cue line.' },
      { character_id: 'alice', text: 'Now it is my turn.' },
    ],
  };

  await setupRehearseWithLive(page, compactFixture);
  await page.click('#btn-compact');

  await expect(page.locator('.compact-note')).toContainText('3 skipped lines');
  const state = await page.evaluate(() => window.__TT_TEST__.getState());
  expect(state.lineIndex).toBe(3);
  await expect(page.locator('#scene-inner .line.active')).toHaveAttribute('data-idx', '3');
  await expect(page.locator('#scene-inner .line.active .who')).toContainText('Bob');
});

test('turnComplete advances to next user line', async ({ page }) => {
  await setupRehearseWithLive(page);
  await page.click('#btn-start');

  // User line → AI line → turnComplete
  await page.evaluate(() => {
    const lb = window.__TT_BACKENDS__.liveBackend;
    lb.triggerInputTranscription('Hello Bob how are you today.');
    lb.triggerOutputTranscription('I am doing well thank you.');
  });

  // Bob is active; trigger partner turn complete and advance
  await page.evaluate(() => {
    window.__TT_BACKENDS__.liveBackend.triggerTurnComplete();
  });

  // Should now be on Alice's second line (lineIndex=2)
  await expect(page.locator('#scene-inner .line.mine.active')).toBeVisible({ timeout: 3000 });
  const state = await page.evaluate(() => window.__TT_TEST__.getState());
  expect(state.lineIndex).toBe(2);
});

test('interrupted event flushes audio playback', async ({ page }) => {
  await setupRehearseWithLive(page);
  await page.click('#btn-start');

  // Play some audio first
  await page.evaluate(() => {
    window.__TT_BACKENDS__.liveBackend.triggerAudio('AAABBBCCC');
  });

  await page.evaluate(() => {
    window.__TT_BACKENDS__.liveBackend.triggerInterrupted();
  });

  // The mock audioIO tracks flush calls
  const flushed = await page.evaluate(() => window.__TT_BACKENDS__.audioIO._flushed);
  expect(flushed).toBe(true);
});
