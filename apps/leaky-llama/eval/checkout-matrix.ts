/**
 * The checkout cast, switch by switch, against the real store and PayPal's sandbox.
 *
 * For each customer, only that customer's switch is left leaky and everything else is sealed. A
 * grader that is right catches that leak and nobody else's. All-sealed and all-leaky runs bracket
 * the matrix. Nothing here uses Claude: the cost is sandbox calls only.
 *
 *   pnpm --filter @shakedown/leaky-llama start   # or dev; the store must be running
 *   pnpm eval:checkout                            # writes docs/EVAL-CHECKOUT.md
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  allLeaky,
  allSealed,
  type CampaignResult,
  getPersona,
  httpStoreTarget,
  loadEnv,
  type PersonaId,
  requireEnv,
  runCampaign,
  type StoreMode,
  sandboxPayPalSide,
  signCampaignToken,
} from '@shakedown/core'
import { PayPalSandboxClient } from '@shakedown/paypal'

process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env.local'))
const env = requireEnv(loadEnv(process.env), [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'SHAKEDOWN_PROBE_SECRET',
])
const store = process.env.LEAKY_LLAMA_URL?.trim() || 'http://localhost:3100'
const CAST: PersonaId[] = ['double-clicker', 'cart-shuffler', 'echo', 'bouncer']
const SEED = 2026

interface Tally {
  leaks: number
  inconclusive: number
  sealed: number
}

const only = (persona: PersonaId): StoreMode => ({ ...allSealed(), [persona]: 'leaky' })

const SETUPS: { label: string; mode: StoreMode; expectLeaky: PersonaId[] }[] = [
  { label: 'All sealed', mode: allSealed(), expectLeaky: [] },
  ...CAST.map((persona) => ({
    label: `Only ${getPersona(persona).shortName} leaky`,
    mode: only(persona),
    expectLeaky: [persona],
  })),
  { label: 'All leaky', mode: allLeaky(), expectLeaky: [...CAST] },
]

async function run(mode: StoreMode, campaignId: string): Promise<CampaignResult> {
  const token = await signCampaignToken(
    { campaignId, exp: Date.now() + 20 * 60_000, mode },
    env.SHAKEDOWN_PROBE_SECRET,
  )
  const target = await httpStoreTarget({
    baseUrl: store,
    probeSecret: env.SHAKEDOWN_PROBE_SECRET,
    campaignToken: token,
  })
  const paypal = sandboxPayPalSide(
    new PayPalSandboxClient({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
    }),
  )
  return runCampaign({ target, paypal, cast: CAST, seed: SEED, campaignId })
}

function tally(result: CampaignResult): Record<PersonaId, Tally> {
  const out = Object.fromEntries(
    CAST.map((p) => [p, { leaks: 0, inconclusive: 0, sealed: 0 }]),
  ) as Record<PersonaId, Tally>
  for (const outcome of result.outcomes) {
    const row = out[outcome.persona]
    if (!row) continue
    for (const { result: graded } of outcome.results) {
      if (graded.verdict === 'leak') row.leaks += 1
      else if (graded.verdict === 'inconclusive') row.inconclusive += 1
      else row.sealed += 1
    }
  }
  return out
}

const rows: { label: string; expectLeaky: PersonaId[]; tallies: Record<PersonaId, Tally> }[] = []
// One case per customer per run: leaky cases should be caught, sealed ones left alone.
let caught = 0
let planted = 0
let clean = 0
let wrong = 0
const stamp = Date.now().toString(36).toUpperCase()
for (const [index, setup] of SETUPS.entries()) {
  console.log(`${setup.label}…`)
  const result = await run(setup.mode, `CMP-MATRIX-${stamp}-${index}`)
  const tallies = tally(result)
  rows.push({ label: setup.label, expectLeaky: setup.expectLeaky, tallies })
  for (const persona of CAST) {
    const { leaks } = tallies[persona]
    if (setup.expectLeaky.includes(persona)) {
      planted += 1
      if (leaks > 0) caught += 1
    } else {
      clean += 1
      if (leaks > 0) wrong += 1
    }
  }
}

const cell = (t: Tally, expected: boolean) => {
  const verdict = t.leaks > 0 ? `**${t.leaks} leak${t.leaks === 1 ? '' : 's'}**` : 'sealed'
  const mark = expected === t.leaks > 0 ? '' : ' ✗'
  return `${verdict}${t.inconclusive ? ` · ${t.inconclusive} inconclusive` : ''}${mark}`
}

const lines = [
  '# Evaluation: the checkout cast, switch by switch',
  '',
  `Measured by \`pnpm eval:checkout\` on ${new Date().toISOString().slice(0, 10)}, against Leaky Llama`,
  'and the PayPal sandbox, seed 2026. Nothing here is estimated, and nothing here uses Claude.',
  '',
  'Leaky Llama has one switch per customer. Each row below is one run of the four checkout',
  'customers with the switches set as named: a customer should report a leak when its own switch is',
  'leaky, and only then.',
  '',
  `**In the ${planted} cases where a customer’s switch was leaky, it reported the leak ${caught === planted ? 'every time' : `${caught} times`}. In the ${clean} cases where its switch was sealed, it reported ${wrong === 0 ? 'none' : `${wrong} false alarms`}.**`,
  '',
  `| Store switches | ${CAST.map((p) => getPersona(p).shortName).join(' | ')} |`,
  `|---|${CAST.map(() => '---').join('|')}|`,
  ...rows.map(
    (row) =>
      `| ${row.label} | ${CAST.map((p) => cell(row.tallies[p], row.expectLeaky.includes(p))).join(' | ')} |`,
  ),
  '',
  'Each cell counts the checks graded from PayPal’s sandbox records. The Echo’s two inconclusive',
  'checks are honest: against a store that verifies signatures, only PayPal can sign, so a test',
  'can show that unsigned copies were refused, not what the store does with genuine repeats.',
  '',
]
const out = path.resolve(import.meta.dirname, '../../../docs/EVAL-CHECKOUT.md')
writeFileSync(out, lines.join('\n'))
console.log(
  `\n${caught}/${planted} leaky cases caught, ${wrong}/${clean} sealed cases flagged. Wrote ${path.relative(process.cwd(), out)}.`,
)
if (caught !== planted || wrong > 0) process.exitCode = 1
