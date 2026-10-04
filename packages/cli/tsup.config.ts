import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    // The binary. The AI layer becomes its own chunk, loaded only by runs that use Claude.
    index: 'src/index.ts',
    // What a config file imports: `defineConfig` and the config types. No dependencies.
    define: 'src/define.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // Workspace packages and zod are bundled in; the Anthropic SDK and yaml are installed.
  noExternal: [/^@shakedown\//, 'zod'],
  external: ['@anthropic-ai/sdk', 'yaml'],
  banner: { js: '#!/usr/bin/env node' },
})
