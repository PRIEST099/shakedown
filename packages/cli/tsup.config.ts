import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // Ship one self-contained file: workspace packages and zod are bundled in.
  noExternal: [/^@shakedown\//, 'zod'],
  banner: { js: '#!/usr/bin/env node' },
})
