const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Only PR CI adds the live dependency gate; deployment and offline units do not.
  globalSetup: process.env.GITHUB_EVENT_NAME === 'pull_request'
    ? require.resolve('./scripts/check-font-assets.mjs') : undefined,
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:8010',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:test -- --test-font-fixtures && exec python3 scripts/serve.py --port 8010 --directory _site',
    url: 'http://127.0.0.1:8010',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--host-resolver-rules=MAP www.samanthafernando.com 127.0.0.1'],
        },
      },
    },
    {
      name: 'firefox',
      testMatch: 'firefox-input-diagnostic.spec.js',
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chromium',
      grep: /@mobile/,
      use: {
        ...devices['Pixel 5'],
        launchOptions: {
          args: ['--host-resolver-rules=MAP www.samanthafernando.com 127.0.0.1'],
        },
      },
    },
  ],
});
