'use client'

import type { PersonaId } from '@shakedown/core'
import { getPersona } from '@shakedown/core/cast'
import type { AgWidgetParams } from 'ag-studio'
import { useLayoutEffect, useRef, useState } from 'react'
import { latest, readTable, usd, useWidgetData } from '../table-data'
import { layoutWaterfall, type WaterfallStep } from './waterfall-layout'

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

/** Its box's size, as the browser lays it out: the chart is drawn for exactly that. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<{ width: number; height: number }>()
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.floor(entry.contentRect.width)
      const height = Math.floor(entry.contentRect.height)
      setSize((now) => (now?.width === width && now.height === height ? now : { width, height }))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * Where the money would have gone: each customer's leak steps the total up, merchant leak in red
 * ink and customer harm in highlighter, ending on the run's total. Drawn by hand so it carries
 * the receipt's look, and so a sealed run reads as what it is: a flat line at $0.00. It is laid
 * out for the size of its box (`waterfall-layout.ts`), so it stays readable small and grows when
 * expanded.
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
      const steps: WaterfallStep[] = []
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

  return (
    <div className="sd-widget sd-waterfall">
      <Plot steps={data.steps} total={data.total} />
      <p className="sd-waterfall__legend">
        <span className="sd-key sd-key--merchant" /> Merchant leak
        <span className="sd-key sd-key--customer" /> Customer harm
      </p>
    </div>
  )
}

function Plot({ steps, total }: { steps: WaterfallStep[]; total: number }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const layout =
    size && size.width > 0 && size.height > 0
      ? layoutWaterfall(steps, total, size.width, size.height)
      : undefined
  return (
    <div ref={ref} className="sd-waterfall__plot">
      {layout ? (
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={`Would have leaked: ${usd(total)}`}
        >
          <title>{`Leak waterfall: ${usd(total)} would have leaked`}</title>
          {layout.ticks.map((tick) => (
            <g key={tick.y}>
              <line
                className="sd-waterfall__grid"
                x1={layout.grid.x1}
                x2={layout.grid.x2}
                y1={tick.y}
                y2={tick.y}
              />
              <text
                className="sd-waterfall__axis"
                style={{ fontSize: layout.font.axis }}
                x={layout.grid.x1 - 8}
                y={tick.y + layout.font.axis / 3}
                textAnchor="end"
              >
                {tick.text}
              </text>
            </g>
          ))}
          {layout.bars.map((bar) => (
            <g key={bar.id} className={bar.total ? 'is-total' : undefined}>
              {bar.merchant ? (
                <rect
                  className="sd-waterfall__merchant"
                  x={bar.x}
                  width={bar.width}
                  y={bar.merchant.y}
                  height={bar.merchant.height}
                />
              ) : null}
              {bar.customer ? (
                <rect
                  className="sd-waterfall__customer"
                  x={bar.x}
                  width={bar.width}
                  y={bar.customer.y}
                  height={bar.customer.height}
                />
              ) : null}
              {bar.zeroY === undefined ? null : (
                <line
                  className="sd-waterfall__zero"
                  x1={bar.x}
                  x2={bar.x + bar.width}
                  y1={bar.zeroY}
                  y2={bar.zeroY}
                />
              )}
              {bar.connector ? (
                <line
                  className="sd-waterfall__connector"
                  x1={bar.connector.x1}
                  x2={bar.connector.x2}
                  y1={bar.connector.y}
                  y2={bar.connector.y}
                />
              ) : null}
              <text
                className={bar.value.leak ? 'sd-waterfall__value is-leak' : 'sd-waterfall__value'}
                style={{ fontSize: layout.font.value }}
                x={bar.value.x}
                y={bar.value.y}
                textAnchor="middle"
              >
                {bar.value.text}
              </text>
              <text
                className="sd-waterfall__label"
                style={{ fontSize: layout.font.label }}
                x={bar.label.x}
                y={bar.label.y}
                textAnchor="middle"
              >
                {bar.label.lines.map((line, i) => (
                  <tspan key={line} x={bar.label.x} dy={i === 0 ? 0 : layout.font.label + 3}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  )
}
