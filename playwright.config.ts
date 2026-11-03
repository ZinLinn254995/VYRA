import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    // Browser tests exercise authenticated generation flows with an isolated,
    // non-production Supabase session. Provider endpoints are mocked per test.
    storageState: './tests/e2e-auth-state.json',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: '4173',
      VITE_E2E_SEED_PROJECTS: 'true',
      VITE_SUPABASE_URL: 'https://e2e-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-test-anon-key-not-a-real-credential',
    },
  },
});
