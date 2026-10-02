import path from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

// Shares the repo-root .env.local. Next runs with the app folder as cwd.
loadEnvConfig(path.resolve(process.cwd(), '../..'))

const config: NextConfig = {
  poweredByHeader: false,
}

export default config
