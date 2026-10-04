import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // Workspace packages ship as TypeScript, so they are bundled in, with their pure-JS helpers.
  // Render's SDK and the Postgres driver are installed alongside.
  noExternal: [/^@shakedown\//, 'zod', /^drizzle-orm/],
  external: ['@renderinc/sdk', 'postgres'],
})
