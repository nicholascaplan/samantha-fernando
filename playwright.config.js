const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'exec python3 -m http.server 8000',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: !process.env.CI,
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
