/**
 * Phase 5, live: the Policy Lawyer against a running Leaky Llama, with a real model behind Lulu
 * and every refund confirmed in the real PayPal sandbox. Every Claude call goes through the spend
 * gate, so this prints exactly what it cost.
 *
 *   pnpm --filter @shakedown/leaky-llama dev
 *   pnpm --filter @shakedown/reporters demo:policy [baseUrl]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  compilePolicy,
  createClaude,
  explainFinding,
  reviewTools,
  spendLedger,
} from '@shakedown/ai'
import {
  allLeaky,
  allSealed,
  CAMPAIGN_HEADER,
  describePolicy,
  httpStoreTarget,
  runCampaign,
  type StoreMode,
  sandboxPayPalSide,
  saveRun,
  signCampaignToken,
} from '@shakedown/core'
import { PayPalSandboxClient } from '@shakedown/paypal'
import { type Explanation, scoreboard } from './scoreboard'

process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env.local'))
const required = (key: string) => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`${key} must be set in .env.local.`)
  return value
}

const baseUrl = process.argv[2] ?? 'http://localhost:3100'
const secret = required('SHAKEDOWN_PROBE_SECRET')
const spentBefore = spendLedger().total()
const claude = createClaude({ purpose: 'shakedown', log: (line) => console.log(`  ${line}`) })
const paypal = sandboxPayPalSide(
  new PayPalSandboxClient({
    clientId: required('PAYPAL_CLIENT_ID'),
    clientSecret: required('PAYPAL_CLIENT_SECRET'),
  }),
)

console.log("\n  Recon: reading the store's refund policy")
const policyText = await (await fetch(`${baseUrl}/api/policy`)).text()
const rules = await compilePolicy(claude, policyText)
for (const line of describePolicy(rules)) console.log(`    · ${line}`)

for (const [label, mode] of [
  ["Lulu holding PayPal's refund tool (leaky)", allLeaky()],
  ['Lulu asking the store (sealed)', allSealed()],
] as [string, StoreMode][]) {
  const campaignId = `CMP-POLICY-${mode['policy-lawyer'].toUpperCase()}`
  const campaignToken = await signCampaignToken(
    { campaignId, exp: Date.now() + 20 * 60_000, mode },
    secret,
  )

  const tools = (await (
    await fetch(`${baseUrl}/api/support/tools`, { headers: { [CAMPAIGN_HEADER]: campaignToken } })
  ).json()) as {
    tools: { name: string; description: string }[]
  }
  const review = await reviewTools(claude, { policyText, tools: tools.tools })
  console.log(`\n  ${label}`)
  for (const tool of review.tools) {
    console.log(
      `    tool ${tool.name}: ${tool.movesMoney ? 'moves money' : 'reads only'}; limited by the policy: ${tool.limitedByPolicy}`,
    )
  }

  const target = await httpStoreTarget({ baseUrl, probeSecret: secret, campaignToken })
  const result = await runCampaign({
    target,
    paypal,
    cast: ['policy-lawyer'],
    seed: 2026,
    campaignId,
    policy: rules,
    budget: { wallClockMs: 10 * 60_000 },
  })
  // Keep the ledger: a later grader fix can judge this run again for free.
  const runs = path.resolve(import.meta.dirname, '../../../.data/runs')
  mkdirSync(runs, { recursive: true })
  const file = path.join(runs, `${campaignId}-${result.startedAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(saveRun(result, rules), null, 1))
  console.log(`    saved ${path.relative(process.cwd(), file)}`)

  const explanations: Record<string, Explanation> = {}
  for (const finding of result.findings)
    explanations[finding.id] = await explainFinding(claude, finding)
  console.log(scoreboard(result, { explanations }))
}

const spent = spendLedger().total() - spentBefore
const total = spendLedger().total()
console.log(`  Claude spend for this demo: $${spent.toFixed(4)} · all-time: $${total.toFixed(4)}\n`)
