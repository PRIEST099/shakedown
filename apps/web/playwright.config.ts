import { defineConfig } from '@playwright/test'

/**
 * End-to-end checks of the public site against a production build on its own port, with its own
 * campaign store. They drive the Chrome already installed on this machine, so nothing is
 * downloaded, and live runs are switched off, so they make no PayPal or Claude calls.
 */
const PORT = 3201
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `rm -rf .data/pglite-e2e && pnpm build && CONSOLE_DATA_DIR=.data/pglite-e2e SHAKEDOWN_CONSOLE_LIVE=0 pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
