import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against a production build of the store on its own port and its own fresh
 * database, so they never race the dev server's on-demand compiles or share its data. They drive
 * the Chrome already installed on this machine, so nothing is downloaded. The purchase test pays
 * with PayPal's published sandbox test card on this local page; it reaches only the sandbox.
 */
const PORT = 3101
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
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
    command: `rm -rf .data/pglite-e2e && pnpm build && STORE_DATA_DIR=.data/pglite-e2e pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
