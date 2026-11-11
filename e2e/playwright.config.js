import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/screenshots.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 90000,
  reporter: 'list',
  globalSetup: './scripts/globalSetup.js',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'node src/server.js',
      cwd: '../backend',
      url: 'http://localhost:5000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120000,
      env: {
        PORT: '5000',
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://127.0.0.1:27017/devopspulse_test',
        SCHEDULER_ENABLED: 'false',
        CLIENT_ORIGIN: 'http://localhost:5173',
        JWT_SECRET: 'devopspulse_e2e_secret_test_32_chars_long',
        AUTH_RATE_LIMIT_MAX: '1000',
        CHECK_RATE_LIMIT_MAX: '1000'
      }
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      cwd: '../frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000
    }
  ]
});
