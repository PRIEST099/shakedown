import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests only: e2e/ belongs to Playwright (pnpm e2e).
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
  },
})
