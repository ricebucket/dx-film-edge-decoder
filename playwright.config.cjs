// End-to-end tests in a real browser: `npm run test:e2e`.
// Playwright is installed outside this repository; see scripts/run-e2e.mjs.
const os = require('node:os');
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  // Keep test artifacts (traces, screenshots) out of the project folder.
  outputDir: process.env.E2E_OUTPUT_DIR || path.join(os.tmpdir(), 'dx-film-edge-decoder-e2e'),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // Phones in both mobile engines: Chromium (Android) and WebKit (Safari, iPhone).
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 10 Pro'] } },
    { name: 'iphone', use: { ...devices['iPhone 17 Pro'] } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
