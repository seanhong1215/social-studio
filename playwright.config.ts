import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './artifacts/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8791',
    video: 'on',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
  },
  projects: [
    { name: 'chromium', testIgnore: /mobile-review\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', testMatch: /mobile-review\.spec\.ts/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run e2e:serve',
    url: 'http://127.0.0.1:8791/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
