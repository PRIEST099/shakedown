import {
  CAST,
  type CampaignResult,
  type LedgerEntry,
  type PersonaId,
  type Severity,
  type StoreMode,
  type Verdict,
} from '@shakedown/core'
import { describeSwitches, runLabel } from './labels'

export { describeSwitches, runLabel }

/**
 * The console's read model. A campaign comes out of the store (or straight out of the engine for
 * a live run) and becomes plain rows: the tables AG Studio charts, filters and hands to its agents.
 * Nothing here decides a verdict; every verdict and amount was graded from PayPal's ledger before
 * it got this far.
 */

export interface StoredFinding {
  id: string
  invariant: string
  title: string
  severity: Severity
  merchantLeakCents: number
  customerHarmCents: number
  detail: string
  fix: string
  evidence: readonly { label: string; value: string }[]
  at: string
}

export interface StoredScenario {
  persona: PersonaId
  scenario: string
  title: string
  position: number
  error?: string | null
  skipped?: string | null
  entries: readonly LedgerEntry[]
  checks: readonly { invariant: string; title: string; verdict: Verdict; detail: string }[]
  findings: readonly StoredFinding[]
}

export type CampaignSource = 'live' | 'cli' | 'recorded'

export interface StoredCampaign {
  id: string
  seed: number
  target: string
  startedAt: string
  finishedAt: string
  stoppedEarly?: string | null
  merchantLeakCents: number
  customerHarmCents: number
  source: CampaignSource
  switches?: Partial<StoreMode> | null
  scenarios: readonly StoredScenario[]
}

export function storedFromResult(
  result: CampaignResult,
  meta: { source: CampaignSource; switches?: Partial<StoreMode> | null },
): StoredCampaign {
  return {
    id: result.campaignId,
    seed: result.seed,
    target: result.target,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    stoppedEarly: result.stoppedEarly ?? null,
    merchantLeakCents: result.merchantLeakCents,
    customerHarmCents: result.customerHarmCents,
    source: meta.source,
    switches: meta.switches ?? null,
    scenarios: result.outcomes.map((outcome, position) => ({
      persona: outcome.persona,
      scenario: outcome.scenario,
      title: outcome.title,
      position,
      error: outcome.error ?? null,
      skipped: outcome.skipped ?? null,
      entries: outcome.entries,
      checks: outcome.results.map(({ invariant, result }) => ({
        invariant: invariant.id,
        title: invariant.title,
        verdict: result.verdict,
        detail: result.detail,
      })),
      findings: outcome.findings.map((finding) => ({
        id: finding.id,
        invariant: finding.invariant,
        title: finding.title,
        severity: finding.severity,
        merchantLeakCents: finding.merchantLeakCents,
        customerHarmCents: finding.customerHarmCents,
        detail: finding.detail,
        fix: finding.fix,
        evidence: finding.evidence,
        at: finding.at,
      })),
    })),
  }
}

// --- rows --------------------------------------------------------------------------------------

export interface CampaignRow {
  campaign_id: string
  run_label: string
  started_at: string
  target: string
  source: CampaignSource
  switches: string
  /** The customers sent, as a comma list of IDs. */
  cast: string
  /** RUNNING only for a live run the console is still receiving. */
  verdict: 'LEAK' | 'SEALED' | 'INCONCLUSIVE' | 'RUNNING'
  leaks: number
  sealed_checks: number
  inconclusive_checks: number
  skipped_scenarios: number
  merchant_leak_usd: number
  customer_harm_usd: number
  at_risk_usd: number
  seed: number
}

export interface CheckRow {
  check_id: string
  campaign_id: string
  persona_id: PersonaId
  persona: string
  scenario: string
  check: string
  verdict: 'Leak' | 'Sealed' | 'Inconclusive'
  severity: Severity | null
  finding_key: string | null
  detail: string
  merchant_leak_usd: number
  customer_harm_usd: number
  at_risk_usd: number
}

export interface FindingRow {
  finding_key: string
  finding_id: string
  campaign_id: string
  persona_id: PersonaId
  persona: string
  scenario: string
  check: string
  severity: Severity
  severity_rank: number
  merchant_leak_usd: number
  customer_harm_usd: number
  at_risk_usd: number
  detail: string
  fix: string
  /** The evidence as JSON, label and value per item, quoted from the ledger. */
  evidence: string
  paypal_ids: string
  found_at: string
}

export interface LedgerRow {
  entry_key: string
  campaign_id: string
  persona_id: PersonaId
  persona: string
  scenario: string
  seq: number
  kind: string
  at: string
  summary: string
  paypal_id: string | null
  amount_usd: number | null
  status: string | null
  /** True when a finding quotes this entry's PayPal ID as evidence. */
  cited: boolean
}

export interface CastRow {
  persona_id: PersonaId
  persona_no: number
  persona: string
  tests: string
  channel: string
}

export interface ConsoleTables {
  campaigns: CampaignRow[]
  checks: CheckRow[]
  findings: FindingRow[]
  ledger: LedgerRow[]
  cast: CastRow[]
}

const usd = (cents: number) => Math.round(cents) / 100
const personaName = (id: PersonaId) => CAST.find((persona) => persona.id === id)?.name ?? id
const VERDICT_WORD = { leak: 'Leak', sealed: 'Sealed', inconclusive: 'Inconclusive' } as const
const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 }

export function consoleTables(campaigns: readonly StoredCampaign[]): ConsoleTables {
  const tables: ConsoleTables = {
    campaigns: [],
    checks: [],
    findings: [],
    ledger: [],
    cast: CAST.filter((persona) => persona.id !== 'second-opinion').map((persona) => ({
      persona_id: persona.id,
      persona_no: persona.number,
      persona: persona.name,
      tests: persona.tests,
      channel: persona.channel,
    })),
  }

  for (const campaign of campaigns) {
    let leaks = 0
    let sealed = 0
    let inconclusive = 0
    let skipped = 0

    for (const scenario of campaign.scenarios) {
      if (scenario.skipped) skipped += 1
      const persona = personaName(scenario.persona)
      const cited = new Set(
        scenario.findings.flatMap((finding) =>
          finding.evidence.flatMap((item) => item.value.split(/[\s,()]+/)),
        ),
      )

      for (const check of scenario.checks) {
        const finding = scenario.findings.find((f) => f.invariant === check.invariant)
        const leaked = check.verdict === 'leak' && finding
        if (check.verdict === 'leak') leaks += 1
        if (check.verdict === 'sealed') sealed += 1
        if (check.verdict === 'inconclusive') inconclusive += 1
        tables.checks.push({
          check_id: `${campaign.id}:${scenario.scenario}:${check.invariant}`,
          campaign_id: campaign.id,
          persona_id: scenario.persona,
          persona,
          scenario: scenario.title,
          check: check.title,
          verdict: VERDICT_WORD[check.verdict],
          severity: leaked ? finding.severity : null,
          finding_key: leaked ? `${campaign.id}:${finding.id}` : null,
          detail: check.detail,
          merchant_leak_usd: leaked ? usd(finding.merchantLeakCents) : 0,
          customer_harm_usd: leaked ? usd(finding.customerHarmCents) : 0,
          at_risk_usd: leaked ? usd(finding.merchantLeakCents + finding.customerHarmCents) : 0,
        })
      }

      for (const finding of scenario.findings) {
        tables.findings.push(findingRow(campaign.id, scenario.persona, scenario.title, finding))
      }

      scenario.entries.forEach((entry, index) => {
        const line = describeEntry(entry)
        tables.ledger.push({
          entry_key: `${campaign.id}:${scenario.position}:${index}`,
          campaign_id: campaign.id,
          persona_id: scenario.persona,
          persona,
          scenario: scenario.title,
          seq: scenario.position * 1000 + index,
          kind: entry.kind,
          at: entry.at,
          summary: line.summary,
          paypal_id: line.paypalId ?? null,
          amount_usd: line.amountCents === undefined ? null : usd(line.amountCents),
          status: line.status ?? null,
          cited: line.paypalId !== undefined && cited.has(line.paypalId),
        })
      })
    }

    const atRisk = campaign.merchantLeakCents + campaign.customerHarmCents
    tables.campaigns.push({
      campaign_id: campaign.id,
      run_label: runLabel(campaign),
      started_at: campaign.startedAt,
      target: campaign.target,
      source: campaign.source,
      switches: describeSwitches(campaign.switches),
      cast: [...new Set(campaign.scenarios.map((scenario) => scenario.persona))].join(','),
      verdict: leaks > 0 ? 'LEAK' : inconclusive > 0 && sealed === 0 ? 'INCONCLUSIVE' : 'SEALED',
      leaks,
      sealed_checks: sealed,
      inconclusive_checks: inconclusive,
      skipped_scenarios: skipped,
      merchant_leak_usd: usd(campaign.merchantLeakCents),
      customer_harm_usd: usd(campaign.customerHarmCents),
      at_risk_usd: usd(atRisk),
      seed: campaign.seed,
    })
  }
  return tables
}

/** One finding as a row: shared by stored campaigns and by a live run's findings as they land. */
export function findingRow(
  campaignId: string,
  personaId: PersonaId,
  scenarioTitle: string,
  finding: StoredFinding,
): FindingRow {
  return {
    finding_key: `${campaignId}:${finding.id}`,
    finding_id: finding.id,
    campaign_id: campaignId,
    persona_id: personaId,
    persona: personaName(personaId),
    scenario: scenarioTitle,
    check: finding.title,
    severity: finding.severity,
    severity_rank: SEVERITY_RANK[finding.severity],
    merchant_leak_usd: usd(finding.merchantLeakCents),
    customer_harm_usd: usd(finding.customerHarmCents),
    at_risk_usd: usd(finding.merchantLeakCents + finding.customerHarmCents),
    detail: finding.detail,
    fix: finding.fix,
    evidence: JSON.stringify(finding.evidence),
    paypal_ids: [...new Set(finding.evidence.flatMap((item) => paypalIds(item.value)))].join(' '),
    found_at: finding.at,
  }
}

/** PayPal and sandbox IDs quoted in a piece of evidence. */
function paypalIds(value: string): string[] {
  return value.match(/\b(?:[0-9A-Z]{17}|WH-[0-9A-Z-]{8,}|PP-[A-Z]-[0-9A-Z-]+)\b/g) ?? []
}

export interface EntryLine {
  summary: string
  paypalId?: string
  amountCents?: number
  status?: string
}

const money = (cents: number | undefined) =>
  cents === undefined ? '' : `$${(cents / 100).toFixed(2)}`
const clip = (text: string, length = 140) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text

/** One readable line per ledger entry, for the ledger tape. */
export function describeEntry(entry: LedgerEntry): EntryLine {
  switch (entry.kind) {
    case 'order-opened':
      return {
        summary: `Order ${entry.orderId} opened for ${money(entry.amountCents)}`,
        paypalId: entry.captureId,
        amountCents: entry.amountCents,
      }
    case 'delivery':
      return {
        summary: `Webhook ${entry.eventType}, ${entry.signed ? 'signed' : 'unsigned'}: the listener answered HTTP ${entry.status} and ${entry.accepted ? 'accepted it' : 'refused it'}`,
        paypalId: entry.eventId,
        status: String(entry.status),
      }
    case 'probe':
      return {
        summary: `The store says ${entry.status}: ${entry.fulfillmentCount} fulfilment${entry.fulfillmentCount === 1 ? '' : 's'}${entry.shipments ? `, ${entry.shipments.length} shipment${entry.shipments.length === 1 ? '' : 's'}` : ''}${entry.refunds?.length ? `, ${entry.refunds.length} refund${entry.refunds.length === 1 ? '' : 's'}` : ''}`,
        paypalId: entry.captureId ?? entry.paypalOrderId ?? undefined,
        amountCents: entry.amountCents,
        status: entry.status,
      }
    case 'chat':
      return {
        summary: clip(`Customer: “${entry.customer}” → Assistant: “${entry.reply}”`),
        status: String(entry.status),
      }
    case 'fixture':
      return { summary: `Test fixture: order ${entry.ref} aged by ${entry.days} days` }
    case 'paypal-refund':
      return {
        summary: `PayPal's ledger: refund ${entry.refundId} is ${entry.status}`,
        paypalId: entry.refundId,
        amountCents: entry.amountCents,
        status: entry.status,
      }
    case 'checkout':
      return {
        summary:
          entry.status < 300
            ? `Checkout opened${entry.storeOrderId ? ` as ${entry.storeOrderId}` : ''}${entry.reused ? ' (an existing order came back)' : ''} for ${money(entry.amountCents)}`
            : `The store refused the checkout (HTTP ${entry.status})${entry.error ? `: ${clip(entry.error, 80)}` : ''}`,
        paypalId: entry.paypalOrderId,
        amountCents: entry.amountCents,
        status: String(entry.status),
      }
    case 'card':
      return {
        summary: `Card payment at PayPal${entry.decline ? ' with a card set to decline' : ''}: order ${entry.orderStatus ?? `HTTP ${entry.status}`}`,
        paypalId: entry.paypalOrderId,
        status: entry.orderStatus,
      }
    case 'capture':
      return {
        summary: `The store answered the capture: ${entry.answer}${entry.shipped ? ', and shipped' : ''}`,
        paypalId: entry.captureId ?? entry.paypalOrderId,
        status: entry.answer,
      }
    case 'paypal-order':
      return {
        summary: `PayPal's ledger: order ${entry.status}${entry.captures.length ? `, captures ${entry.captures.map((c) => `${c.id} ${c.status}`).join(', ')}` : ', no captures'}`,
        paypalId: entry.captures[0]?.id ?? entry.paypalOrderId,
        amountCents: entry.captures.reduce((sum, capture) => sum + capture.amountCents, 0),
        status: entry.status,
      }
    case 'note':
      return { summary: clip(entry.detail) }
  }
}
