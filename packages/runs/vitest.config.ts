import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // PGlite boots a real Postgres in WebAssembly; give the first migration room.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
