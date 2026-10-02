import { describeSecret, EnvError, loadEnv, type ShakedownEnv } from '@shakedown/core'
import { PAYPAL_SANDBOX_API_BASE, sandboxApiUrl } from '@shakedown/paypal'
import { EXIT } from './exit-codes'

export interface Check {
  label: string
  ok: boolean
  detail: string
}

export interface PreflightResult {
  exitCode: number
  checks: Check[]
}

/** True when the sandbox lock refuses a live PayPal host, as it must. */
function sandboxLockHolds(): boolean {
  try {
    sandboxApiUrl('https://api-m.paypal.com/v1/oauth2/token')
    return false
  } catch {
    return true
  }
}

export function preflight(source: Record<string, string | undefined>): PreflightResult {
  let env: ShakedownEnv
  try {
    env = loadEnv(source)
  } catch (error) {
    if (!(error instanceof EnvError)) throw error
    const lockRefused = error.issues.some((issue) => issue.startsWith('PAYPAL_ENV'))
    return {
      exitCode: lockRefused ? EXIT.safetyLock : EXIT.config,
      checks: error.issues.map((issue) => ({ label: 'Environment', ok: false, detail: issue })),
    }
  }

  const lock = sandboxLockHolds()
  const checks: Check[] = [
    { label: 'PayPal environment', ok: true, detail: `sandbox (${PAYPAL_SANDBOX_API_BASE})` },
    {
      label: 'Sandbox lock',
      ok: lock,
      detail: lock ? 'live hosts are refused' : 'SELF-TEST FAILED',
    },
    {
      label: 'PAYPAL_CLIENT_ID',
      ok: env.PAYPAL_CLIENT_ID !== undefined,
      detail: env.PAYPAL_CLIENT_ID ? 'set' : 'missing: add it to .env.local',
    },
    {
      label: 'PAYPAL_CLIENT_SECRET',
      ok: env.PAYPAL_CLIENT_SECRET !== undefined,
      detail: env.PAYPAL_CLIENT_SECRET
        ? describeSecret(env.PAYPAL_CLIENT_SECRET)
        : 'missing: add it to .env.local',
    },
    {
      label: 'ANTHROPIC_API_KEY',
      ok: true,
      detail: `${describeSecret(env.ANTHROPIC_API_KEY)} (needed from Phase 5)`,
    },
  ]
  return { exitCode: checks.every((c) => c.ok) ? EXIT.pass : EXIT.preflight, checks }
}
