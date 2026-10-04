import type { CampaignResult, PersonaId, Severity, StoreMode, Verdict } from '@shakedown/core'
import { CAST } from '@shakedown/core'

/**
 * The report, as versioned JSON. Everything else (the terminal receipt, HTML, JUnit, the PR
 * comment) is rendered from this, so a saved report can be shown again without re-running.
 */
export const REPORT_SCHEMA = 'shakedown.report/v1'

/** A plain-language explanation the AI layer wrote for a finding. */
export interface Explanation {
  headline: string
  explanation: string
  firstStep: string
}

export interface ReportCheck {
  invariant: string
  title: string
  verdict: Verdict
  detail: string
  evidence: { label: string; value: string }[]
  /** Set on leaks. */
  severity?: Severity
  findingId?: string
  fix?: string
  merchantLeakCents: number
  customerHarmCents: number
  explanation?: Explanation
}

export interface ReportScenario {
  id: string
  title: string
  plan: string[]
  checks: ReportCheck[]
  skipped?: string
  error?: string
}

export interface ReportPersona {
  id: PersonaId
  number: number
  name: string
  channel: string
  tests: string
  scenarios: ReportScenario[]
}

export interface ShakedownReport {
  schema: typeof REPORT_SCHEMA
  tool: { name: string; version: string }
  campaign: {
    id: string
    seed: number
    target: string
    startedAt: string
    finishedAt: string
    stoppedEarly?: string
    /** The demo store's switches for this campaign, when a campaign token set them. */
    switches?: Partial<StoreMode>
  }
  totals: {
    merchantLeakCents: number
    customerHarmCents: number
    leaks: number
    sealed: number
    inconclusive: number
    skipped: number
    personasTested: number
    personasLeaking: number
  }
  personas: ReportPersona[]
  ai?: { spentUsd: number }
}

export interface ReportMeta {
  tool?: { name: string; version: string }
  switches?: Partial<StoreMode>
  explanations?: Readonly<Record<string, Explanation>>
  aiSpentUsd?: number
}

export function buildReport(result: CampaignResult, meta: ReportMeta = {}): ShakedownReport {
  const personas: ReportPersona[] = []
  for (const outcome of result.outcomes) {
    let persona = personas.find((entry) => entry.id === outcome.persona)
    if (!persona) {
      const cast = CAST.find((entry) => entry.id === outcome.persona)
      persona = {
        id: outcome.persona,
        number: cast?.number ?? 0,
        name: cast?.name ?? outcome.persona,
        channel: cast?.channel ?? '',
        tests: cast?.tests ?? '',
        scenarios: [],
      }
      personas.push(persona)
    }
    persona.scenarios.push({
      id: outcome.scenario,
      title: outcome.title,
      plan: [...outcome.plan],
      skipped: outcome.skipped,
      error: outcome.error,
      checks: outcome.results.map(({ invariant, result: graded }) => {
        const finding = outcome.findings.find((entry) => entry.invariant === invariant.id)
        const leaked = graded.verdict === 'leak' && finding
        return {
          invariant: invariant.id,
          title: invariant.title,
          verdict: graded.verdict,
          detail: graded.detail,
          evidence: (graded.evidence ?? []).map((item) => ({
            label: item.label,
            value: item.value,
          })),
          severity: leaked ? finding.severity : undefined,
          findingId: leaked ? finding.id : undefined,
          fix: leaked ? finding.fix : undefined,
          merchantLeakCents: leaked ? finding.merchantLeakCents : 0,
          customerHarmCents: leaked ? finding.customerHarmCents : 0,
          explanation: leaked ? meta.explanations?.[finding.id] : undefined,
        }
      }),
    })
  }

  const checks = personas.flatMap((persona) =>
    persona.scenarios.flatMap((scenario) => scenario.checks),
  )
  const count = (verdict: Verdict) => checks.filter((check) => check.verdict === verdict).length
  const tested = personas.filter((persona) =>
    persona.scenarios.some((scenario) => !scenario.skipped),
  )
  return {
    schema: REPORT_SCHEMA,
    tool: meta.tool ?? { name: '@shakedown-dev/cli', version: '0.0.0' },
    campaign: {
      id: result.campaignId,
      seed: result.seed,
      target: result.target,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      stoppedEarly: result.stoppedEarly,
      switches: meta.switches,
    },
    totals: {
      merchantLeakCents: result.merchantLeakCents,
      customerHarmCents: result.customerHarmCents,
      leaks: count('leak'),
      sealed: count('sealed'),
      inconclusive: count('inconclusive'),
      skipped: personas
        .flatMap((persona) => persona.scenarios)
        .filter((scenario) => scenario.skipped).length,
      personasTested: tested.length,
      personasLeaking: tested.filter((persona) =>
        persona.scenarios.some((scenario) =>
          scenario.checks.some((check) => check.verdict === 'leak'),
        ),
      ).length,
    },
    personas,
    ai: meta.aiSpentUsd === undefined ? undefined : { spentUsd: meta.aiSpentUsd },
  }
}

/** Read a saved report, refusing anything that isn't this version of the schema. */
export function parseReport(json: string): ShakedownReport {
  const report = JSON.parse(json) as Partial<ShakedownReport>
  if (report.schema !== REPORT_SCHEMA) {
    throw new Error(`Not a ${REPORT_SCHEMA} report (schema: ${String(report.schema)}).`)
  }
  return report as ShakedownReport
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
