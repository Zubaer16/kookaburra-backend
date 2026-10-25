import { defineConfig } from '@playwright/test'

// API-only Playwright runner; Chromium/download is NOT required.
const port = Number(process.env.API_TEST_PORT || 4101)
if (port !== 4101)
  throw new Error(
    'API test port is fixed at 4101 to avoid dev-server confusion',
  )
const mode = process.env.API_TEST_MODE
if (mode !== 'smoke' && mode !== 'db') {
  throw new Error(
    'Run tests through npm run test:api:smoke or npm run test:api:db',
  )
}

export default defineConfig({
  testDir: './api-tests',
  projects: [
    { name: 'smoke', testMatch: /\.smoke\.spec\.ts$/ },
    { name: 'db', testMatch: /\.db\.spec\.ts$/ },
    { name: 'security', testMatch: /\.security\.spec\.ts$/ },
  ],
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4101',
    extraHTTPHeaders: { Accept: 'application/json' },
    trace: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-api-report', open: 'never' }],
  ],
  outputDir: 'test-results-api',
  webServer: {
    command: 'node -r dotenv/config dist/main.js',
    url: 'http://127.0.0.1:4101/v1/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '4101',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    },
  },
})
