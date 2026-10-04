import { PayPalSandboxClient } from '@shakedown/paypal'
import { type RunnerName, runEnvironment } from '@shakedown/runs'
import { judgeMode } from './live'

/**
 * Whether a live run can work right now. When it can't, the site and the console say why and
 * show a recording of a real run instead, labelled as one.
 */
export interface LiveStatus {
  live: boolean
  /** Why not: switched off, not set up, or the demo store or PayPal's sandbox isn't answering. */
  reason?: 'off' | 'setup' | 'store' | 'paypal'
  runner: RunnerName
  judge: boolean
  checkedAt: string
}

const CACHE_MS = 60_000

const holder = globalThis as unknown as { __shakedownStatus?: { at: number; status: LiveStatus } }

export async function liveStatus(
  deps: { fetch?: typeof fetch; now?: () => number; fresh?: boolean } = {},
): Promise<LiveStatus> {
  const now = deps.now?.() ?? Date.now()
  const cached = holder.__shakedownStatus
  if (!deps.fresh && cached && now - cached.at < CACHE_MS) return cached.status
  const status = await check(deps.fetch ?? fetch)
  holder.__shakedownStatus = { at: now, status }
  return status
}

async function check(transport: typeof fetch): Promise<LiveStatus> {
  const runner: RunnerName =
    process.env.SHAKEDOWN_WORKFLOW?.trim() && process.env.RENDER_API_KEY?.trim()
      ? 'render-workflows'
      : 'in-process'
  const base = { runner, judge: judgeMode(), checkedAt: new Date().toISOString() }
  if (process.env.SHAKEDOWN_CONSOLE_LIVE === '0') return { ...base, live: false, reason: 'off' }
  let env: ReturnType<typeof runEnvironment>
  try {
    env = runEnvironment()
  } catch {
    return { ...base, live: false, reason: 'setup' }
  }
  // Without PayPal, every checkout customer would be skipped: no run worth showing.
  if (!env.paypal) return { ...base, live: false, reason: 'setup' }

  const store = await transport(`${env.storeUrl}/api/health`, {
    signal: AbortSignal.timeout(4_000),
    cache: 'no-store',
  })
    .then((res) => res.ok)
    .catch(() => false)
  if (!store) return { ...base, live: false, reason: 'store' }

  // A fresh client, so the check asks PayPal now rather than trusting a cached token.
  const paypal = await new PayPalSandboxClient(env.paypal, { fetch: transport })
    .accessToken()
    .then(() => true)
    .catch(() => false)
  if (!paypal) return { ...base, live: false, reason: 'paypal' }
  return { ...base, live: true }
}
