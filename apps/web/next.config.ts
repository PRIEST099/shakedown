import path from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

// One .env.local at the repo root serves every app. Next runs with the app folder as cwd.
loadEnvConfig(path.resolve(process.cwd(), '../..'))

const config: NextConfig = {
  transpilePackages: ['@shakedown/core', '@shakedown/tokens', '@shakedown/ui'],
  poweredByHeader: false,
}

export default config
