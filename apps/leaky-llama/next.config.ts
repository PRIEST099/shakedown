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

/**
 * Defence in depth for every page: nobody may frame it, sniff it or give it a <base>, and the
 * browser features it never uses stay off. Strict transport only where there is TLS: on Render.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.RENDER
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
]

const config: NextConfig = {
  transpilePackages: ['@shakedown/core', '@shakedown/paypal', '@shakedown/support-bot'],
  // PGlite ships Postgres as WebAssembly; load it from node_modules rather than bundling it.
  serverExternalPackages: ['@electric-sql/pglite', '@paypal/agent-toolkit'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default config
