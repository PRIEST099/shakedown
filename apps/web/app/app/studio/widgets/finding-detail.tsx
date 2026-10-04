'use client'

import type { PersonaId } from '@shakedown/core'
import { getPersona } from '@shakedown/core/cast'
import type { AgWidgetParams } from 'ag-studio'
import { latest, readTable, usd, useWidgetData } from '../table-data'

interface Finding extends Record<string, unknown> {
  finding_key: string
  finding_id: string
  campaign_id: string
  persona_id: PersonaId
  scenario: string
  check: string
  severity: string
  severity_rank: number
  merchant_leak_usd: number
  customer_harm_usd: number
  detail: string
  fix: string
  evidence: string
}

function evidence(json: string): { label: string; value: string }[] {
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? (parsed as { label: string; value: string }[]) : []
  } catch {
    return []
  }
}

/**
 * One leak, in full: what happened, the evidence quoted verbatim from the ledger (real sandbox
 * IDs), what was at risk and the fix. Pick a line on the Tape to show it; otherwise the worst
 * leak of the latest run in view is shown.
 */
export function FindingDetailWidget(params: AgWidgetParams) {
  const data = useWidgetData(
    params,
    async (api) => {
      const [campaigns, findings] = await Promise.all([
        readTable(api, 'campaigns', ['campaign_id', 'started_at', 'verdict']),
        readTable<Finding>(api, 'findings', [
          'finding_key',
          'finding_id',
          'campaign_id',
          'persona_id',
          'scenario',
          'check',
          'severity',
          'severity_rank',
          'merchant_leak_usd',
          'customer_harm_usd',
          'detail',
          'fix',
          'evidence',
        ]),
      ])
      const run = campaigns && latest(campaigns)
      const all = findings ?? []
      // A single finding in scope means someone picked it; otherwise stay on the latest run.
      const pool =
        all.length === 1 ? all : all.filter((f) => run && f.campaign_id === run.campaign_id)
      const ranked = [...pool].sort(
        (a, b) =>
          Number(b.severity_rank) - Number(a.severity_rank) ||
          Number(b.merchant_leak_usd) +
            Number(b.customer_harm_usd) -
            Number(a.merchant_leak_usd) -
            Number(a.customer_harm_usd),
      )
      return { finding: ranked[0], count: pool.length, running: run?.verdict === 'RUNNING' }
    },
    () => false,
  )
  if (!data) return null
  const { finding } = data

  if (!finding && data.running) {
    return (
      <div className="sd-widget sd-finding sd-finding--none">
        <p className="sd-finding__hint">Waiting for the first finding…</p>
      </div>
    )
  }
  if (!finding) {
    return (
      <div className="sd-widget sd-finding sd-finding--none">
        <p className="sd-finding__sealed">No leaks in this run.</p>
        <p className="sd-finding__hint">
          Every check that ran held, so nothing would have leaked. Pick another run above to see its
          findings.
        </p>
      </div>
    )
  }

  const persona = getPersona(finding.persona_id)
  const merchant = Number(finding.merchant_leak_usd)
  const customer = Number(finding.customer_harm_usd)
  return (
    <article className="sd-widget sd-finding">
      <header className="sd-finding__head">
        <span className={`sd-finding__severity is-${finding.severity}`}>{finding.severity}</span>
        <span className="sd-finding__id">{finding.finding_id}</span>
        {data.count > 1 ? <span className="sd-finding__more">worst of {data.count}</span> : null}
      </header>
      <h3 className="sd-finding__title">{finding.check}</h3>
      <p className="sd-finding__who">
        {persona.name} · {finding.scenario}
      </p>
      <p className="sd-finding__detail">{finding.detail}</p>
      <dl className="sd-finding__evidence">
        {evidence(finding.evidence).map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="sd-finding__risk">
        At risk:{' '}
        {merchant > 0 ? <strong className="is-leak">{usd(merchant)} merchant</strong> : null}
        {merchant > 0 && customer > 0 ? ' · ' : null}
        {customer > 0 ? <strong className="is-leak">{usd(customer)} customer</strong> : null}
        {merchant === 0 && customer === 0 ? <strong>$0.00 this time</strong> : null}
      </p>
      <p className="sd-finding__fix">
        <mark>Fix</mark> {finding.fix}
      </p>
    </article>
  )
}
