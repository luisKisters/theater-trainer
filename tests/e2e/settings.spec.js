import { test, expect } from '@playwright/test';

test('settings persist after page reload', async ({ page }) => {
  await page.goto('/#settings');

  // Fill in the API key
  await page.fill('#api-key-input', 'test-key-123');

  // Set slider to 5000 via JS (range inputs need value + event dispatch)
  await page.locator('#slider-wait').evaluate(el => {
    el.value = '5000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Assert the display updated
  await expect(page.locator('#wait-display')).toHaveText('5.0s');

  // Save
  await page.click('#btn-save-settings');

  // Reload and navigate back to settings
  await page.goto('/#settings');

  // Assert persistence
  await expect(page.locator('#api-key-input')).toHaveValue('test-key-123');
  await expect(page.locator('#slider-wait')).toHaveValue('5000');
  await expect(page.locator('#wait-display')).toHaveText('5.0s');
});

test('rehearse view is blocked with API key prompt when no key is set', async ({ page }) => {
  // Fresh context has no localStorage — navigate straight to rehearse
  await page.goto('/#rehearse');

  const rehearseView = page.locator('#view-rehearse');
  await expect(rehearseView).toHaveClass(/active/);
  await expect(rehearseView).toContainText(/API key/i);
  await expect(rehearseView).toContainText(/Settings/i);
});

test('rehearse unblocked after saving a key in settings', async ({ page }) => {
  // Set a key via settings
  await page.goto('/#settings');
  await page.fill('#api-key-input', 'my-valid-key');
  await page.click('#btn-save-settings');

  // Navigate to rehearse — should no longer show key prompt
  await page.click('[data-view="rehearse"]');
  const rehearseView = page.locator('#view-rehearse');
  await expect(rehearseView).toHaveClass(/active/);
  await expect(rehearseView).not.toContainText(/API key is required/i);
});

test('voice picker value persists', async ({ page }) => {
  await page.goto('/#settings');
  await page.selectOption('#voice-picker', 'Aoede');
  await page.click('#btn-save-settings');

  await page.goto('/#settings');
  await expect(page.locator('#voice-picker')).toHaveValue('Aoede');
});

test('show-corrections toggle persists', async ({ page }) => {
  await page.goto('/#settings');
  // Default is checked; uncheck it
  await page.locator('#show-corrections').uncheck();
  await page.click('#btn-save-settings');

  await page.goto('/#settings');
  await expect(page.locator('#show-corrections')).not.toBeChecked();
});
