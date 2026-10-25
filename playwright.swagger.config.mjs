import { defineConfig } from '@playwright/test'

// Runners validate the target database before launching the browser.
// Smoke/isolated modes use 4101; opt-in local dev inspection uses 4102.
const port = Number(process.env.API_TEST_PORT)
const mode = process.env.API_TEST_MODE
if (
  !(port === 4101 && ['smoke', 'db'].includes(mode)) &&
  !(
    port === 4102 &&
    mode === 'dev-inspect' &&
    process.env.API_DEV_INSPECT_APPROVED === 'YES'
  )
) {
  throw new Error('Use the guarded npm run test:api:visual:* scripts')
}

export default defineConfig({
  testDir: './swagger-ui-tests',
  projects: [
    { name: 'visual-smoke', testMatch: /\.smoke\.spec\.ts$/ },
    { name: 'visual-db', testMatch: /\.db\.spec\.ts$/ },
    { name: 'visual-dev', testMatch: /\.inspect\.spec\.ts$/ },
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: false,
    launchOptions: { slowMo: 900 },
    viewport: { width: 1280, height: 820 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-swagger-report', open: 'never' }],
  ],
  outputDir: 'test-results-swagger',
  webServer: {
    command: 'node -r dotenv/config dist/main.js',
    url: `http://127.0.0.1:${port}/v1/health`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    },
  },
})
