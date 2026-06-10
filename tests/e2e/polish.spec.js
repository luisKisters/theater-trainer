import { test, expect } from '@playwright/test';

// ── Shared fixture ─────────────────────────────────────────────────────────────

const FIXTURE_SCRIPT = {
  title: 'Polish Test Scene',
  author: 'Test',
  language: 'en',
  characters: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob',   name: 'Bob'   },
  ],
  lines: [
    { character_id: 'alice', text: 'Hello Bob how are you.' },
    { character_id: 'bob',   text: 'I am fine thank you.' },
  ],
};

function makeEmitter() {
  const h = {};
  return {
    on(e, fn) { (h[e] = h[e] || []).push(fn); },
    off(e, fn) { if (h[e]) h[e] = h[e].filter(x => x !== fn); },
    _emit(e, d) { (h[e] || []).slice().forEach(f => f(d)); },
  };
}

/** Navigate to the rehearse view with mocked backends. */
async function setupRehearsePolish(page, overrides = {}) {
  await page.addInitScript(([fixture, ovr]) => {
    function makeEm() {
      const h = {};
      return {
        on(e, fn) { (h[e] = h[e] || []).push(fn); },
        off(e, fn) { if (h[e]) h[e] = h[e].filter(x => x !== fn); },
        _emit(e, d) { (h[e] || []).slice().forEach(f => f(d)); },
      };
    }

    const lb = ovr.liveBackend || {
      ...makeEm(),
      async connect() { this._emit('connected'); },
      disconnect() {},
      sendAudio() {},
    };

    const aio = ovr.audioIO || {
      async startMic() {},
      stopMic() {},
      play() {},
      flush() {},
      stop() {},
    };

    window.__TT_BACKENDS__ = {
      scriptProcessor: { process: async () => JSON.parse(JSON.stringify(fixture)) },
      liveBackend: lb,
      audioIO: aio,
    };
  }, [FIXTURE_SCRIPT, overrides]);

  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key');
  await page.click('#btn-save-settings');

  await page.goto('/#add');
  await page.fill('#paste-input', 'placeholder');
  await page.click('#btn-process');
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 5000 });

  await page.click('.btn-open-script');
  await expect(page.locator('#role-picker-dialog')).toBeVisible();
  await page.click('[data-role-id="alice"]');
  await expect(page.locator('#view-rehearse')).toHaveClass(/active/, { timeout: 3000 });
}

// ── Manifest + offline shell ───────────────────────────────────────────────────

test('manifest is accessible and well-formed', async ({ page }) => {
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.icons).toBeTruthy();
  expect(Array.isArray(manifest.icons)).toBe(true);
});

test('offline shell loads via service worker cache', async ({ page, context }) => {
  await page.goto('/');
  // Give SW time to install and cache the shell
  await page.waitForTimeout(3000);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
    // App shell should be served from SW cache
    await expect(page.locator('#app')).toBeVisible({ timeout: 5000 });
    const title = await page.title();
    expect(title).toMatch(/Theater Trainer/);
  } finally {
    await context.setOffline(false);
  }
});

// ── Mobile bottom sheet ────────────────────────────────────────────────────────

test('mobile viewport shows bottom-sheet handle and Reveal button', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();

  await pg.addInitScript(([fixture]) => {
    function makeEm() {
      const h = {};
      return {
        on(e, fn) { (h[e] = h[e] || []).push(fn); },
        off(e, fn) { if (h[e]) h[e] = h[e].filter(x => x !== fn); },
        _emit(e, d) { (h[e] || []).slice().forEach(f => f(d)); },
      };
    }
    window.__TT_BACKENDS__ = {
      scriptProcessor: { process: async () => JSON.parse(JSON.stringify(fixture)) },
      liveBackend: { ...makeEm(), async connect() {}, disconnect() {}, sendAudio() {} },
      audioIO: { async startMic() {}, stopMic() {}, play() {}, flush() {}, stop() {} },
    };
  }, [FIXTURE_SCRIPT]);

  await pg.goto('/#settings');
  await pg.fill('#api-key-input', 'test-key');
  await pg.click('#btn-save-settings');

  await pg.goto('/#add');
  await pg.fill('#paste-input', 'placeholder');
  await pg.click('#btn-process');
  await expect(pg.locator('#view-library')).toHaveClass(/active/, { timeout: 5000 });

  await pg.click('.btn-open-script');
  await pg.click('[data-role-id="alice"]');
  await expect(pg.locator('#view-rehearse')).toHaveClass(/active/, { timeout: 3000 });

  // Handle and Reveal button should be visible on mobile
  await expect(pg.locator('.handle')).toBeVisible();
  await expect(pg.locator('#btn-reveal-word')).toBeVisible();

  await ctx.close();
});

// ── Error toasts ───────────────────────────────────────────────────────────────

test('error toast shown when mic permission is denied', async ({ page }) => {
  await page.addInitScript(([fixture]) => {
    function makeEm() {
      const h = {};
      return {
        on(e, fn) { (h[e] = h[e] || []).push(fn); },
        off(e, fn) { if (h[e]) h[e] = h[e].filter(x => x !== fn); },
        _emit(e, d) { (h[e] || []).slice().forEach(f => f(d)); },
      };
    }
    window.__TT_BACKENDS__ = {
      scriptProcessor: { process: async () => JSON.parse(JSON.stringify(fixture)) },
      liveBackend: { ...makeEm(), async connect() {}, disconnect() {}, sendAudio() {} },
      audioIO: {
        async startMic() {
          const err = new DOMException('Permission denied', 'NotAllowedError');
          throw err;
        },
        stopMic() {}, play() {}, flush() {}, stop() {},
      },
    };
  }, [FIXTURE_SCRIPT]);

  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key');
  await page.click('#btn-save-settings');

  await page.goto('/#add');
  await page.fill('#paste-input', 'placeholder');
  await page.click('#btn-process');
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 5000 });

  await page.click('.btn-open-script');
  await page.click('[data-role-id="alice"]');
  await expect(page.locator('#view-rehearse')).toHaveClass(/active/, { timeout: 3000 });

  await page.click('#btn-start');

  const toast = page.locator('.toast.err');
  await expect(toast).toBeVisible({ timeout: 3000 });
  await expect(toast).toContainText(/mic|permission/i);
});

test('error toast shown when backend connection fails', async ({ page }) => {
  await page.addInitScript(([fixture]) => {
    function makeEm() {
      const h = {};
      return {
        on(e, fn) { (h[e] = h[e] || []).push(fn); },
        off(e, fn) { if (h[e]) h[e] = h[e].filter(x => x !== fn); },
        _emit(e, d) { (h[e] || []).slice().forEach(f => f(d)); },
      };
    }
    window.__TT_BACKENDS__ = {
      scriptProcessor: { process: async () => JSON.parse(JSON.stringify(fixture)) },
      liveBackend: {
        ...makeEm(),
        async connect() { throw new Error('API_KEY_INVALID: key is not valid'); },
        disconnect() {},
        sendAudio() {},
      },
      audioIO: { async startMic() {}, stopMic() {}, play() {}, flush() {}, stop() {} },
    };
  }, [FIXTURE_SCRIPT]);

  await page.goto('/#settings');
  await page.fill('#api-key-input', 'bad-key');
  await page.click('#btn-save-settings');

  await page.goto('/#add');
  await page.fill('#paste-input', 'placeholder');
  await page.click('#btn-process');
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 5000 });

  await page.click('.btn-open-script');
  await page.click('[data-role-id="alice"]');
  await expect(page.locator('#view-rehearse')).toHaveClass(/active/, { timeout: 3000 });

  await page.click('#btn-start');

  const toast = page.locator('.toast.err');
  await expect(toast).toBeVisible({ timeout: 3000 });
  await expect(toast).toContainText(/connection error|API_KEY/i);
});
