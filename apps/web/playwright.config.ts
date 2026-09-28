import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // After desktop, not beside it: both projects write the same seeded rows.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, dependencies: ['desktop'] },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
