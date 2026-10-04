'use client'

import type { PersonaId } from '@shakedown/core'
import { getPersona } from '@shakedown/core/cast'
import { formatCents, LedgerNumber, Stamp } from '@shakedown/ui'
import type { AgWidgetParams } from 'ag-studio'
import { latest, readTable, tableFields, useWidgetData } from '../table-data'

interface Campaign extends Record<string, unknown> {
  campaign_id: string
  run_label: string
  started_at: unknown
  switches: string
  source: string
  verdict: string
}
interface Finding extends Record<string, unknown> {
  finding_key: string
  campaign_id: string
  persona_id: PersonaId
  check: string
  severity: string
  merchant_leak_usd: number
  customer_harm_usd: number
  paypal_ids: string
}
interface Check extends Record<string, unknown> {
  campaign_id: string
  persona_id: PersonaId
  verdict: string
}

const cents = (usd: number) => Math.round(Number(usd) * 100)

/** The Tape: the latest run in view as a till receipt, one line per leak, then the total. */
export function ScoreboardWidget(params: AgWidgetParams) {
  const data = useWidgetData(
    params,
    async (api) => {
      const campaigns = await readTable<Campaign>(api, 'campaigns', [
        'campaign_id',
        'run_label',
        'started_at',
        'switches',
        'source',
        'verdict',
      ])
      const run = campaigns && latest(campaigns)
      if (!run) return undefined
      const [findings, checks] = await Promise.all([
        readTable<Finding>(
          api,
          'findings',
          [
            'finding_key',
            'campaign_id',
            'persona_id',
            'check',
            'severity',
            'merchant_leak_usd',
            'customer_harm_usd',
            'paypal_ids',
          ],
          { sortBy: { id: 'merchant_leak_usd', direction: 'desc' } },
        ),
        readTable<Check>(api, 'checks', ['check_id', 'campaign_id', 'persona_id', 'verdict']),
      ])
      return {
        run,
        runsInView: campaigns.length,
        findings: (findings ?? []).filter((f) => f.campaign_id === run.campaign_id),
        checks: (checks ?? []).filter((c) => c.campaign_id === run.campaign_id),
      }
    },
    () => false,
  )
  if (!data) return null

  const { run, findings, checks } = data
  const total = findings.reduce(
    (sum, f) => sum + cents(f.merchant_leak_usd) + cents(f.customer_harm_usd),
    0,
  )
  const leakingPersonas = new Set(findings.map((f) => f.persona_id))
  const held = [...new Set(checks.map((c) => c.persona_id))].filter(
    (id) => !leakingPersonas.has(id),
  )
  const running = run.verdict === 'RUNNING'
  const sealed = findings.length === 0 && !running
  const select = (key: string) => {
    const field = tableFields(params.widgetApi, 'findings', ['finding_key'])?.[0]
    if (field) {
      params.widgetApi.toggleCrossFilter({
        type: 'value',
        field,
        value: key,
        group: 0,
        reset: true,
      })
    }
  }

  return (
    <div className="sd-widget sd-widget--tape">
      <figure className={`sd-tape sd-tape--${sealed ? 'sealed' : 'leak'}`}>
        <div className="sd-tape__paper">
          <header className="sd-tape__header">Shakedown · test run</header>
          <p className="sd-tape__meta">
            {running
              ? 'Live sandbox run, printing'
              : run.source === 'recorded'
                ? 'Recorded sandbox run'
                : 'Sandbox run'}{' '}
            · {run.switches}
            <br />
            {run.run_label}
            {data.runsInView > 1 ? ` · latest of ${data.runsInView} in view` : ''}
          </p>
          <hr className="sd-tape__perf" />
          <ol className="sd-tape__lines">
            {findings.map((finding) => {
              const persona = getPersona(finding.persona_id)
              const amount = -(cents(finding.merchant_leak_usd) + cents(finding.customer_harm_usd))
              return (
                <li key={finding.finding_key} className="sd-tape__line is-leak">
                  <button
                    type="button"
                    className="sd-tape__pick"
                    onClick={(event) => {
                      event.stopPropagation()
                      select(finding.finding_key)
                    }}
                    title="Show this leak in Finding detail"
                  >
                    <span className="sd-tape__row">
                      <span className="sd-tape__glyph" aria-hidden="true">
                        ▼
                      </span>
                      <span className="sd-tape__name">
                        <span className="sd-sr-only">Leak: </span>
                        {persona.shortName}
                      </span>
                      <span className="sd-tape__amount">{formatCents(amount)}</span>
                    </span>
                    <span className="sd-tape__evidence">
                      {finding.check}
                      {finding.paypal_ids ? ` · ${finding.paypal_ids.split(' ')[0]}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
            {running && findings.length === 0 ? (
              <li className="sd-tape__line">
                <span className="sd-tape__evidence">The customers are still at the till…</span>
              </li>
            ) : null}
            {held.map((id) => (
              <li key={id} className="sd-tape__line is-sealed">
                <span className="sd-tape__row">
                  <span className="sd-tape__glyph" aria-hidden="true">
                    ✓
                  </span>
                  <span className="sd-tape__name">
                    <span className="sd-sr-only">Sealed: </span>
                    {getPersona(id).shortName}
                  </span>
                  <span className="sd-tape__amount">{formatCents(0)}</span>
                </span>
                <span className="sd-tape__evidence">Every check held</span>
              </li>
            ))}
          </ol>
          <div className="sd-tape__double-rule" />
          <div className="sd-tape__total">
            <span className="sd-tape__total-label">
              {running ? 'Leaked so far' : 'Would have leaked'}
            </span>
            <LedgerNumber
              className="sd-tape__total-value"
              fromCents={0}
              toCents={-total}
              progress={1}
            />
          </div>
          {sealed ? <div className="sd-tape__slot" /> : null}
        </div>
        {sealed ? (
          <div className="sd-tape__stamp-slot">
            <Stamp text="SEALED" progress={1} />
          </div>
        ) : null}
      </figure>
    </div>
  )
}
