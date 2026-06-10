import { test, expect } from '@playwright/test';

const FIXTURE_SCRIPT = {
  title: 'Test Scene',
  author: 'Test Author',
  language: 'en',
  characters: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ],
  lines: [
    { character_id: 'alice', text: 'Hello Bob, how are you?' },
    { character_id: 'bob', text: 'I am well, thank you Alice.' },
    { character_id: 'alice', text: 'Shall we begin?' },
  ],
};

function injectMockProcessor(script) {
  return [
    ({ fixtureScript }) => {
      window.__TT_BACKENDS__ = {
        scriptProcessor: {
          process: async () => JSON.parse(JSON.stringify(fixtureScript)),
        },
      };
    },
    { fixtureScript: script },
  ];
}

test('empty library shows add-script prompt', async ({ page }) => {
  await page.goto('/#library');
  const libraryView = page.locator('#view-library');
  await expect(libraryView).toHaveClass(/active/);
  await expect(libraryView).toContainText(/No scripts/i);
});

test('paste text → process → script appears in Library', async ({ page }) => {
  await page.addInitScript(...injectMockProcessor(FIXTURE_SCRIPT));

  // Set API key so Rehearse is not blocked
  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key-abc');
  await page.click('#btn-save-settings');

  // Navigate to Add view
  await page.goto('/#add');
  await page.fill('#paste-input', 'Alice: Hello Bob, how are you?');
  await page.click('#btn-process');

  // Wait for status to show OK
  await expect(page.locator('#add-status')).toContainText(/Script added/i, { timeout: 5000 });

  // Should auto-navigate to Library
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 3000 });

  // Script card should appear with title
  await expect(page.locator('.script-card')).toContainText('Test Scene');
  await expect(page.locator('.script-card')).toContainText('Test Author');
});

test('role picker opens and role can be selected', async ({ page }) => {
  await page.addInitScript(...injectMockProcessor(FIXTURE_SCRIPT));

  // Set API key
  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key-abc');
  await page.click('#btn-save-settings');

  // Process a script
  await page.goto('/#add');
  await page.fill('#paste-input', 'Alice: Hello');
  await page.click('#btn-process');
  await expect(page.locator('#add-status')).toContainText(/Script added/i, { timeout: 5000 });
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 3000 });

  // Open the role picker
  await page.click('.btn-open-script');
  await expect(page.locator('#role-picker-dialog')).toBeVisible();
  await expect(page.locator('#role-picker-dialog')).toContainText('Alice');
  await expect(page.locator('#role-picker-dialog')).toContainText('Bob');
});

test('full flow: paste → process → library → pick role → land on Rehearse', async ({ page }) => {
  await page.addInitScript(...injectMockProcessor(FIXTURE_SCRIPT));

  // Set API key
  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key-abc');
  await page.click('#btn-save-settings');

  // Add script via Add view
  await page.goto('/#add');
  await page.fill('#paste-input', 'Alice: Hello Bob');
  await page.click('#btn-process');
  await expect(page.locator('#add-status')).toContainText(/Script added/i, { timeout: 5000 });
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 3000 });

  // Open role picker
  await page.click('.btn-open-script');
  await expect(page.locator('#role-picker-dialog')).toBeVisible();

  // Pick role "Alice"
  await page.click('[data-role-id="alice"]');

  // Should land on Rehearse with script info
  await expect(page.locator('#view-rehearse')).toHaveClass(/active/, { timeout: 3000 });
  await expect(page.locator('#view-rehearse')).toContainText('Test Scene');
  await expect(page.locator('#view-rehearse')).toContainText('Alice');
  await expect(page.locator('#view-rehearse')).not.toContainText(/No script selected/i);
});

test('add view shows error when no text and no file', async ({ page }) => {
  await page.addInitScript(...injectMockProcessor(FIXTURE_SCRIPT));
  await page.goto('/#add');
  await page.click('#btn-process');
  await expect(page.locator('#add-status')).toContainText(/paste text or upload/i);
});

test('add view shows API key error when no key and no mock', async ({ page }) => {
  // No mock injected, no key set
  await page.goto('/#add');
  await page.fill('#paste-input', 'some text');
  await page.click('#btn-process');
  await expect(page.locator('#add-status')).toContainText(/API key/i);
});

test('role picker cancel closes dialog', async ({ page }) => {
  await page.addInitScript(...injectMockProcessor(FIXTURE_SCRIPT));

  await page.goto('/#settings');
  await page.fill('#api-key-input', 'test-key');
  await page.click('#btn-save-settings');

  await page.goto('/#add');
  await page.fill('#paste-input', 'text');
  await page.click('#btn-process');
  await expect(page.locator('#view-library')).toHaveClass(/active/, { timeout: 3000 });

  await page.click('.btn-open-script');
  await expect(page.locator('#role-picker-dialog')).toBeVisible();

  await page.click('#btn-close-role-picker');
  await expect(page.locator('#role-picker-dialog')).toBeHidden();
});
