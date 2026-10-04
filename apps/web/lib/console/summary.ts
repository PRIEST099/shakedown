import type { ConsoleTables } from './rows'

/**
 * What Triage's leak_summary tool returns: exact totals by customer and by run, computed in code
 * from graded results. The model explains these numbers; it never produces them.
 */
export interface LeakSummary {
  runsCounted: number
  runs: {
    run: string
    switches: string
    verdict: string
    leaks: number
    merchantLeakUsd: number
    customerHarmUsd: number
  }[]
  byCustomer: {
    customer: string
    tests: string
    leaks: number
    sealed: number
    inconclusive: number
    atRiskUsd: number
  }[]
  mostAtRisk: string | null
  worstLeaks: {
    run: string
    customer: string
    check: string
    severity: string
    atRiskUsd: number
    fix: string
  }[]
}

const round = (value: number) => Math.round(value * 100) / 100

export function leakSummary(tables: ConsoleTables, lastRuns = 5): LeakSummary {
  const runs = [...tables.campaigns]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, Math.max(1, Math.min(50, Math.floor(lastRuns))))
  const ids = new Set(runs.map((run) => run.campaign_id))
  const label = new Map(runs.map((run) => [run.campaign_id, run.run_label]))
  const checks = tables.checks.filter((check) => ids.has(check.campaign_id))

  const byCustomer = tables.cast
    .map((persona) => {
      const mine = checks.filter((check) => check.persona_id === persona.persona_id)
      return {
        customer: persona.persona,
        tests: persona.tests,
        leaks: mine.filter((check) => check.verdict === 'Leak').length,
        sealed: mine.filter((check) => check.verdict === 'Sealed').length,
        inconclusive: mine.filter((check) => check.verdict === 'Inconclusive').length,
        atRiskUsd: round(mine.reduce((sum, check) => sum + check.at_risk_usd, 0)),
      }
    })
    .sort((a, b) => b.atRiskUsd - a.atRiskUsd || b.leaks - a.leaks)

  const top = byCustomer[0]
  return {
    runsCounted: runs.length,
    runs: runs.map((run) => ({
      run: run.run_label,
      switches: run.switches,
      verdict: run.verdict,
      leaks: run.leaks,
      merchantLeakUsd: run.merchant_leak_usd,
      customerHarmUsd: run.customer_harm_usd,
    })),
    byCustomer,
    mostAtRisk: top && (top.atRiskUsd > 0 || top.leaks > 0) ? top.customer : null,
    worstLeaks: tables.findings
      .filter((finding) => ids.has(finding.campaign_id))
      .sort((a, b) => b.severity_rank - a.severity_rank || b.at_risk_usd - a.at_risk_usd)
      .slice(0, 3)
      .map((finding) => ({
        run: label.get(finding.campaign_id) ?? finding.campaign_id,
        customer: finding.persona,
        check: finding.check,
        severity: finding.severity,
        atRiskUsd: finding.at_risk_usd,
        fix: finding.fix,
      })),
  }
}
