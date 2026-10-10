import { defineConfig, devices } from '@playwright/test';

// The tests run against the built site, served with its real response headers.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  outputDir: '../test-results/docs',
  reporter: [['list']],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://127.0.0.1:4321', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/serve-dist.mjs',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe'
  }
});
