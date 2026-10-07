import {
  assertTargetAllowed,
  describeSecret,
  EnvError,
  fillPath,
  loadEnv,
  PROBE_HEADER,
  pick,
  type RouteMap,
  resolveRoutes,
  type ShakedownEnv,
  TargetNotAllowedError,
  verifyTargetOwnership,
} from '@shakedown/core'
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
      detail: `${describeSecret(env.ANTHROPIC_API_KEY)} (only for --explain, and to read a refund policy)`,
    },
  ]
  return { exitCode: checks.every((c) => c.ok) ? EXIT.pass : EXIT.preflight, checks }
}

export interface TargetCheckOptions {
  url: string
  allowHosts?: string[]
  probeSecret?: string
  verificationToken?: string
  /** The store's routes, when they aren't Shakedown's own contract. */
  routes?: RouteMap
  /** Set when the config lists what the store sells instead of a catalog route. */
  catalog?: unknown[]
  fetch?: typeof fetch
}

/** Can Shakedown reach this store, may it, and does the store's probe API take our secret? */
export async function preflightTarget(options: TargetCheckOptions): Promise<PreflightResult> {
  const http = options.fetch ?? globalThis.fetch
  const policy = { allowHosts: options.allowHosts, verificationToken: options.verificationToken }
  try {
    const allowed = assertTargetAllowed(options.url, policy)
    await verifyTargetOwnership(allowed, policy, http)
  } catch (error) {
    if (!(error instanceof TargetNotAllowedError)) throw error
    return {
      exitCode: EXIT.safetyLock,
      checks: [{ label: 'Target', ok: false, detail: error.message }],
    }
  }
  const origin = new URL(options.url).origin
  const checks: Check[] = [{ label: 'Target', ok: true, detail: `${origin} (allowed)` }]

  const routes = resolveRoutes(options.routes)
  try {
    if (routes.catalog === false || options.catalog) {
      // No catalog route to ask: check the store answers at all, at its checkout route.
      await http(`${origin}${routes.createOrder.path}`, { method: 'OPTIONS' })
      checks.push({
        label: 'Store',
        ok: true,
        detail: `answering; ${options.catalog?.length ?? 0} products listed in the config`,
      })
    } else {
      const res = await http(`${origin}${routes.catalog.path}`)
      const body = await res.json().catch(() => ({}))
      const items = routes.catalog.items ? pick(body, routes.catalog.items) : body
      checks.push(
        res.ok
          ? {
              label: 'Store',
              ok: true,
              detail: `answering, ${Array.isArray(items) ? items.length : 0} products in the catalog`,
            }
          : {
              label: 'Store',
              ok: false,
              detail: `GET ${routes.catalog.path} answered HTTP ${res.status}`,
            },
      )
    }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code
    checks.push({
      label: 'Store',
      ok: false,
      detail: `not reachable${cause ? ` (${cause})` : ''}. Is it running?`,
    })
    return { exitCode: EXIT.preflight, checks }
  }

  if (!options.probeSecret) {
    checks.push({ label: 'Probe secret', ok: false, detail: 'SHAKEDOWN_PROBE_SECRET is not set' })
  } else {
    const probe = `${origin}${fillPath(routes.probe.path, 'SHAKEDOWN-PREFLIGHT')}`
    const withSecret = await http(probe, { headers: { [PROBE_HEADER]: options.probeSecret } })
    const without = await http(probe)
    checks.push(
      withSecret.status === 403
        ? {
            label: 'Probe secret',
            ok: false,
            detail: 'the store refused it: give both sides the same secret',
          }
        : without.status !== 403
          ? {
              label: 'Probe secret',
              ok: false,
              detail: `the probe API answered without the secret (HTTP ${without.status}); it must refuse anyone without it`,
            }
          : {
              label: 'Probe secret',
              ok: true,
              detail: 'accepted, and the probe API refuses requests without it',
            },
    )
  }
  return { exitCode: checks.every((c) => c.ok) ? EXIT.pass : EXIT.preflight, checks }
}

/** The worst result wins: a safety-lock refusal over a config error over a failed check. */
export function combine(...results: PreflightResult[]): PreflightResult {
  const rank = (code: number) =>
    [EXIT.safetyLock, EXIT.config, EXIT.preflight, EXIT.pass].indexOf(code as never)
  const exitCode = results
    .map((result) => result.exitCode)
    .reduce((worst, code) => (rank(code) < rank(worst) ? code : worst), EXIT.pass as number)
  return { exitCode, checks: results.flatMap((result) => result.checks) }
}
