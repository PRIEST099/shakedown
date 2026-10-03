import path from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

// One .env.local at the repo root serves every app. Next runs with the app folder as cwd and has
// already loaded (and cached) that folder's env by the time this file runs, so force a reload.
loadEnvConfig(
  path.resolve(process.cwd(), '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
)

const config: NextConfig = {
  transpilePackages: ['@shakedown/core', '@shakedown/paypal', '@shakedown/support-bot'],
  // PGlite ships Postgres as WebAssembly; load it from node_modules rather than bundling it.
  serverExternalPackages: ['@electric-sql/pglite', '@paypal/agent-toolkit'],
  poweredByHeader: false,
}

export default config
