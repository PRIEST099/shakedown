import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
    // PGlite boots a real Postgres in WebAssembly; give the first migration room.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
