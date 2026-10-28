import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const playwrightOutputDir = process.env.PLAYWRIGHT_OUTPUT_DIR
  ?? path.join(os.tmpdir(), 'clawsprawl-playwright-test-results');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  outputDir: playwrightOutputDir,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4321',
    port: 4321,
    // Reuse is a convenience for local test runs, but it silently breaks the
    // docs:screenshots capture: that script runs two passes with different
    // CLAWSPRAWL_MODE values, and a reused server keeps whichever mode it was
    // started with. Observed 2026-09-14 — the `public` pass captured an
    // `insecure` (private-unlocked) server, so every stored screenshot said
    // "private view unlocked" and the public-locked image leaked session
    // counts. Never reuse when capturing screenshots.
    reuseExistingServer: !process.env.CI && !process.env.DOCS_SCREENSHOTS,
    timeout: 120000,
  },
});
