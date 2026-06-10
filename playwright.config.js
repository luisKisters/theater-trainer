import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    headless: true,
    baseURL: 'http://localhost:9123',
  },
  webServer: {
    command: 'npx sirv-cli . --port 9123 --cors --single',
    port: 9123,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
