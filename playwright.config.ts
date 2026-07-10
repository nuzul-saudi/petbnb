// S10 — golden-path E2E config. Runs in GitHub Actions ONLY (the `e2e`
// job in .github/workflows/ci.yml); deliberately NOT part of local
// `npm run ci`. Flake policy per the Wave 1a brief: 1 retry, trace
// retained on failure.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 1,
  // Single worker: the golden path mutates real rows (inquiry message +
  // booking request) on the shared E2E accounts — parallel runs would race.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Sandboxed/dev environments with a pre-installed Chromium can point
    // E2E_CHROMIUM at it instead of downloading Playwright's own build.
    // Unset in CI (the workflow runs `playwright install chromium`).
    launchOptions: process.env.E2E_CHROMIUM
      ? { executablePath: process.env.E2E_CHROMIUM }
      : {},
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    port: 4173,
    reuseExistingServer: true,
  },
});
