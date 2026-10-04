'use client'

import type { PersonaId } from '@shakedown/core'
import { getPersona } from '@shakedown/core/cast'
import type { AgWidgetParams } from 'ag-studio'
import { latest, readTable, usd, useWidgetData } from '../table-data'

interface Finding extends Record<string, unknown> {
  campaign_id: string
  persona_id: PersonaId
  merchant_leak_usd: number
  customer_harm_usd: number
}
interface CastRow extends Record<string, unknown> {
  persona_id: PersonaId
  persona_no: number
}

interface Step {
  id: PersonaId | 'total'
  label: string
  merchant: number
  customer: number
  start: number
}

const W = 640
const H = 280
const PAD = { top: 28, right: 12, bottom: 42, left: 52 }

/**
 * Where the money would have gone: each customer's leak steps the total up, merchant leak in red
 * ink and customer harm in highlighter, ending on the run's total. Drawn by hand so it carries
 * the receipt's look, and so a sealed run reads as what it is: a flat line at $0.00.
 */
export function LeakWaterfallWidget(params: AgWidgetParams) {
  const data = useWidgetData(
    params,
    async (api) => {
      const [campaigns, cast, findings] = await Promise.all([
        readTable(api, 'campaigns', ['campaign_id', 'started_at', 'run_label']),
        readTable<CastRow>(api, 'cast', ['persona_id', 'persona_no'], { ignoreCrossFilter: true }),
        readTable<Finding>(api, 'findings', [
          'finding_key',
          'campaign_id',
          'persona_id',
          'merchant_leak_usd',
          'customer_harm_usd',
        ]),
      ])
      const run = campaigns && latest(campaigns)
      if (!run) return undefined
      const order = [...(cast ?? [])].sort((a, b) => Number(a.persona_no) - Number(b.persona_no))
      const mine = (findings ?? []).filter((f) => f.campaign_id === run.campaign_id)
      let running = 0
      const steps: Step[] = []
      for (const { persona_id: id } of order) {
        const own = mine.filter((f) => f.persona_id === id)
        const merchant = own.reduce((sum, f) => sum + Number(f.merchant_leak_usd), 0)
        const customer = own.reduce((sum, f) => sum + Number(f.customer_harm_usd), 0)
        steps.push({ id, label: getPersona(id).shortName, merchant, customer, start: running })
        running += merchant + customer
      }
      const merchant = steps.reduce((sum, s) => sum + s.merchant, 0)
      const customer = steps.reduce((sum, s) => sum + s.customer, 0)
      steps.push({ id: 'total', label: 'Total', merchant, customer, start: 0 })
      return { steps, total: running, label: String(run.run_label) }
    },
    () => false,
  )
  if (!data) return null

  const { steps, total } = data
  const top = Math.max(total, 1)
  const plotH = H - PAD.top - PAD.bottom
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH
  const slot = (W - PAD.left - PAD.right) / steps.length
  const bar = Math.min(56, slot * 0.62)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top)

  return (
    <div className="sd-widget sd-waterfall">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Would have leaked: ${usd(total)}`}>
        <title>{`Leak waterfall: ${usd(total)} would have leaked`}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="sd-waterfall__grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="sd-waterfall__axis" x={PAD.left - 6} y={y(tick) + 4} textAnchor="end">
              {total === 0 ? (tick === 0 ? '$0' : '') : `$${Math.round(tick)}`}
            </text>
          </g>
        ))}
        {steps.map((step, i) => {
          const x = PAD.left + i * slot + (slot - bar) / 2
          const isTotal = step.id === 'total'
          const base = step.start
          const merchantTop = base + step.merchant
          const amount = step.merchant + step.customer
          const next = steps[i + 1]
          return (
            <g key={step.id} className={isTotal ? 'is-total' : undefined}>
              {step.merchant > 0 ? (
                <rect
                  className="sd-waterfall__merchant"
                  x={x}
                  width={bar}
                  y={y(merchantTop)}
                  height={Math.max(1, y(base) - y(merchantTop))}
                />
              ) : null}
              {step.customer > 0 ? (
                <rect
                  className="sd-waterfall__customer"
                  x={x}
                  width={bar}
                  y={y(merchantTop + step.customer)}
                  height={Math.max(1, y(merchantTop) - y(merchantTop + step.customer))}
                />
              ) : null}
              {amount === 0 ? (
                <line
                  className="sd-waterfall__zero"
                  x1={x}
                  x2={x + bar}
                  y1={y(base)}
                  y2={y(base)}
                />
              ) : null}
              {next && next.id !== 'total' ? (
                <line
                  className="sd-waterfall__connector"
                  x1={x + bar}
                  x2={x + slot}
                  y1={y(base + amount)}
                  y2={y(base + amount)}
                />
              ) : null}
              <text
                className={amount > 0 ? 'sd-waterfall__value is-leak' : 'sd-waterfall__value'}
                x={x + bar / 2}
                y={y(base + amount) - 6}
                textAnchor="middle"
              >
                {amount > 0 ? `−${usd(amount)}` : '✓'}
              </text>
              <text
                className="sd-waterfall__label"
                x={x + bar / 2}
                y={H - PAD.bottom + 18}
                textAnchor="middle"
              >
                {step.label}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="sd-waterfall__legend">
        <span className="sd-key sd-key--merchant" /> Merchant leak
        <span className="sd-key sd-key--customer" /> Customer harm
      </p>
    </div>
  )
}
