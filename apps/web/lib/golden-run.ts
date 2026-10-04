import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  type CampaignResult,
  type LedgerEntry,
  type PersonaId,
  regrade,
  type SavedRun,
} from '@shakedown/core'
import type { RunFixture, RunLine } from '@shakedown/ui'

/**
 * The landing page's numbers, read from real recorded sandbox runs (fixtures/recorded) and judged
 * by today's graders. Nothing here is typed in by hand except the words around the numbers: every
 * amount and every ID comes from a run's ledger.
 */

const RECORDED = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'fixtures/recorded')

function recorded(file: string): CampaignResult {
  const { run } = JSON.parse(readFileSync(path.join(RECORDED, file), 'utf8')) as { run: SavedRun }
  return regrade(run)
}

/** The hero's customers, in the order the receipt prints them. */
const HERO_CAST: readonly PersonaId[] = ['double-clicker', 'cart-shuffler', 'echo', 'bouncer']

const PAYPAL_ID = /\b(?:[0-9A-Z]{17}|WH-[0-9A-Z]{12})\b/

const money = (cents: number) =>
  `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function firstId(texts: readonly string[]): string | undefined {
  for (const text of texts) {
    const found = text.match(PAYPAL_ID)?.[0]
    if (found) return found
  }
  return undefined
}

function leakLine(result: CampaignResult, persona: PersonaId): RunLine {
  const findings = result.findings.filter((finding) => finding.persona === persona)
  const amountCents = -findings.reduce(
    (sum, finding) => sum + finding.merchantLeakCents + finding.customerHarmCents,
    0,
  )
  const evidence = findings.flatMap((finding) => finding.evidence.map((item) => item.value))
  const id = firstId(evidence)
  const what = findings.length === 1 ? '1 leak' : `${findings.length} leaks`
  const why: Record<string, string> = {
    'double-clicker': 'charged twice, shipped twice',
    'cart-shuffler': 'shipped more than PayPal captured',
    echo: 'unsigned and repeated “paid” events acted on',
    bouncer: 'a declined card, goods shipped',
  }
  return {
    personaId: persona,
    verdict: 'leak',
    amountCents,
    evidence: [`${what}: ${why[persona] ?? findings[0]?.title ?? ''}`, id]
      .filter(Boolean)
      .join(' · '),
  }
}

function sealedLine(result: CampaignResult, persona: PersonaId): RunLine {
  const outcomes = result.outcomes.filter((outcome) => outcome.persona === persona)
  const verdicts = outcomes.flatMap((outcome) => outcome.results.map((r) => r.result.verdict))
  const details = outcomes.flatMap((outcome) => outcome.results.map((r) => r.result.detail))
  const leaked = verdicts.includes('leak')
  const unsure = verdicts.filter((verdict) => verdict === 'inconclusive').length
  const said: Record<string, string> = {
    'double-clicker': 'charged once, shipped once',
    'cart-shuffler': 'shipped exactly what PayPal captured',
    echo: 'unsigned “paid” refused',
    bouncer: 'a declined card, nothing shipped',
  }
  const id = firstId(details)
  const note = unsure
    ? `${unsure} ${unsure === 1 ? 'check needs' : 'checks need'} PayPal-signed events`
    : undefined
  return {
    personaId: persona,
    verdict: leaked ? 'leak' : unsure ? 'inconclusive' : 'sealed',
    amountCents:
      -result.findings
        .filter((finding) => finding.persona === persona)
        .reduce((sum, finding) => sum + finding.merchantLeakCents + finding.customerHarmCents, 0) ||
      0,
    evidence: [said[persona], note, id].filter(Boolean).join(' · '),
  }
}

export interface GoldenRun extends RunFixture {
  recordedOn: string
  /** The leaky run's totals, for copy that quotes them. */
  merchantLeakCents: number
  customerHarmCents: number
}

/** The hero receipt: the checkout cast against Leaky Llama as shipped, then sealed. */
export function goldenRun(): GoldenRun {
  const leaky = recorded('01-checkout-leaky.json')
  const sealed = recorded('02-checkout-sealed.json')
  const recordedOn = new Date(leaky.startedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return {
    label: `Recorded sandbox run · ${recordedOn}`,
    source: 'recorded',
    store: 'Leaky Llama Supply Co.',
    runId: leaky.campaignId.replace(/^CMP-/, '').slice(0, 8),
    before: HERO_CAST.map((persona) => leakLine(leaky, persona)),
    after: HERO_CAST.map((persona) => sealedLine(sealed, persona)),
    recordedOn,
    merchantLeakCents: leaky.merchantLeakCents,
    customerHarmCents: leaky.customerHarmCents,
  }
}

export interface Exhibit {
  conversation: { customer: string; assistant: string; tools: string[] }
  ledger: { label: string; id: string; amount: string; status: string }[]
  verdict: { title: string; atRisk: string; why: string }
}

/**
 * "AI decides vs code decides": one real exchange with the demo store's support assistant, and
 * what PayPal's ledger recorded because of it. Outcomes, not a playbook: the request is shown,
 * the scenario's script is not.
 */
export function exhibit(): Exhibit {
  const run = recorded('03-policy-leaky.json')
  const outcome = run.outcomes.find((o) => o.scenario === 'policy-lawyer.in-instalments')
  if (!outcome) throw new Error('The recorded Policy Lawyer run has no instalment scenario.')
  const chats = outcome.entries.filter(
    (entry): entry is Extract<LedgerEntry, { kind: 'chat' }> => entry.kind === 'chat',
  )
  const last = chats.at(-1)
  const refunds = outcome.entries.filter(
    (entry): entry is Extract<LedgerEntry, { kind: 'paypal-refund' }> =>
      entry.kind === 'paypal-refund',
  )
  const finding = outcome.findings[0]
  if (!last || refunds.length === 0 || !finding) {
    throw new Error('The recorded instalment scenario is missing its chat, refunds or finding.')
  }
  return {
    conversation: {
      customer: last.customer,
      assistant: last.reply,
      tools: [...(last.toolCalls ?? [])],
    },
    ledger: refunds.map((refund, index) => ({
      label: `PayPal refund ${index + 1}`,
      id: refund.refundId,
      amount: money(refund.amountCents),
      status: refund.status,
    })),
    verdict: {
      title: finding.title,
      atRisk: money(finding.merchantLeakCents + finding.customerHarmCents),
      why:
        finding.evidence.find((item) => item.label === 'Policy')?.value ??
        'The refund went past what the written policy allows.',
    },
  }
}
