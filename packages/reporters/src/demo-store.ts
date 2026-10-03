/**
 * Phase 4, live: the checkout cast and the Echo against a running Leaky Llama, with every
 * payment in the real PayPal sandbox and every verdict graded from PayPal's own ledger.
 *
 *   pnpm --filter @shakedown/leaky-llama dev                  # the store, on :3100
 *   pnpm --filter @shakedown/reporters demo:store [baseUrl] [seed]
 *
 * Three campaigns: every switch leaky, every switch sealed, then leaky again with the same seed
 * to show the result repeats. A signed campaign token tells the store which switches to use, so
 * this never touches anyone else's settings.
 */
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import {
  allLeaky,
  allSealed,
  type CampaignResult,
  fingerprint,
  httpStoreTarget,
  type PersonaId,
  runCampaign,
  type StoreMode,
  sandboxPayPalSide,
  signCampaignToken,
} from '@shakedown/core'
import { PayPalSandboxClient } from '@shakedown/paypal'
import { scoreboard } from './scoreboard'

process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env.local'))

const required = (key: string) => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`${key} must be set in .env.local.`)
  return value
}

const baseUrl = process.argv[2] ?? 'http://localhost:3100'
const seed = Number(process.argv[3] ?? 2026)
const secret = required('SHAKEDOWN_PROBE_SECRET')
const paypal = sandboxPayPalSide(
  new PayPalSandboxClient({
    clientId: required('PAYPAL_CLIENT_ID'),
    clientSecret: required('PAYPAL_CLIENT_SECRET'),
  }),
)
const cast: PersonaId[] = ['double-clicker', 'cart-shuffler', 'echo', 'bouncer']

async function campaign(
  label: string,
  mode: StoreMode,
  campaignId: string,
): Promise<CampaignResult> {
  const campaignToken = await signCampaignToken(
    { campaignId, exp: Date.now() + 20 * 60_000, mode },
    secret,
  )
  const target = await httpStoreTarget({ baseUrl, probeSecret: secret, campaignToken })
  const started = Date.now()
  const result = await runCampaign({
    target,
    paypal,
    cast,
    seed,
    campaignId,
    budget: { wallClockMs: 10 * 60_000 },
  })
  console.log(`\n  ${label} · ${((Date.now() - started) / 1000).toFixed(0)} s`)
  console.log(scoreboard(result))
  return result
}

const first = await campaign('Every switch leaky', allLeaky(), `CMP-LIVE-LEAKY-${seed}`)
await campaign('Every switch sealed', allSealed(), `CMP-LIVE-SEALED-${seed}`)
const again = await campaign(
  'Every switch leaky, same seed again',
  allLeaky(),
  `CMP-LIVE-LEAKY-${seed}`,
)

console.log(
  isDeepStrictEqual(fingerprint(first), fingerprint(again))
    ? '  Same seed, same result: every verdict and every amount matched.\n'
    : '  Same seed, DIFFERENT result. See the receipts above.\n',
)
