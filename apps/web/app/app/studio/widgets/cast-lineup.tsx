'use client'

import type { PersonaId } from '@shakedown/core'
import { getPersona } from '@shakedown/core/cast'
import { Imp } from '@shakedown/ui'
import type { AgWidgetParams } from 'ag-studio'
import { latest, readTable, tableFields, useWidgetData } from '../table-data'

type ImpState = 'idle' | 'running' | 'leak' | 'sealed' | 'inconclusive'

interface CastRow extends Record<string, unknown> {
  persona_id: PersonaId
  persona_no: number
}
interface Check extends Record<string, unknown> {
  campaign_id: string
  persona_id: PersonaId
  verdict: string
  at_risk_usd: number
}

const CHIP: Record<ImpState, string> = {
  idle: 'Not sent',
  running: 'Running…',
  leak: 'Leak',
  sealed: 'Sealed',
  inconclusive: 'Inconclusive',
}

/** The cast for the latest run in view. A leak turns the imp's horns red; a seal makes it sulk. */
export function CastLineupWidget(params: AgWidgetParams) {
  const data = useWidgetData(
    params,
    async (api) => {
      const [cast, campaigns, checks] = await Promise.all([
        readTable<CastRow>(api, 'cast', ['persona_id', 'persona_no'], { ignoreCrossFilter: true }),
        // The whole run stays on show while a selection elsewhere narrows the other widgets.
        readTable(api, 'campaigns', ['campaign_id', 'started_at', 'verdict', 'cast'], {
          ignoreCrossFilter: true,
        }),
        readTable<Check>(
          api,
          'checks',
          ['check_id', 'campaign_id', 'persona_id', 'verdict', 'at_risk_usd'],
          { ignoreCrossFilter: true },
        ),
      ])
      const run = campaigns && latest(campaigns)
      return {
        cast: [...(cast ?? [])].sort((a, b) => Number(a.persona_no) - Number(b.persona_no)),
        checks: (checks ?? []).filter((c) => run && c.campaign_id === run.campaign_id),
        running: run?.verdict === 'RUNNING',
        sent: new Set(
          String(run?.cast ?? '')
            .split(',')
            .filter(Boolean),
        ),
      }
    },
    (value) => value.cast.length === 0,
  )
  if (!data) return null

  const selected = new Set(
    (params.widgetApi.getCrossFilterSelections() ?? []).flatMap((selection) =>
      selection.type === 'value' ? selection.values : [],
    ),
  )
  const toggle = (id: PersonaId) => {
    const field = tableFields(params.widgetApi, 'cast', ['persona_id'])?.[0]
    if (field) {
      params.widgetApi.toggleCrossFilter({ type: 'value', field, value: id, group: 0, reset: true })
    }
  }

  return (
    <div className="sd-widget sd-lineup">
      {data.cast.map(({ persona_id: id }) => {
        const mine = data.checks.filter((check) => check.persona_id === id)
        const state: ImpState = mine.some((c) => c.verdict === 'Leak')
          ? 'leak'
          : mine.some((c) => c.verdict === 'Sealed')
            ? 'sealed'
            : mine.length
              ? 'inconclusive'
              : data.running && data.sent.has(id)
                ? 'running'
                : 'idle'
        const atRisk = mine.reduce((sum, c) => sum + Math.round(Number(c.at_risk_usd) * 100), 0)
        const persona = getPersona(id)
        return (
          <button
            key={id}
            type="button"
            className={`sd-mini sd-mini--${state}${selected.has(id) ? ' is-selected' : ''}`}
            aria-pressed={selected.has(id)}
            onClick={(event) => {
              event.stopPropagation()
              toggle(id)
            }}
            title={`${persona.name}: ${persona.tests}.${state === 'leak' ? ` ${(atRisk / 100).toFixed(2)} USD at risk.` : ''} Click to filter the dashboard.`}
          >
            <span className="sd-mini__art">
              <Imp persona={id} state={state} background />
            </span>
            <span className="sd-mini__name">{persona.shortName}</span>
            <span className={`sd-state sd-state--${state === 'idle' ? 'idle' : state}`}>
              {state === 'leak'
                ? `−$${Math.round(atRisk / 100)}`
                : state === 'idle'
                  ? data.sent.has(id)
                    ? 'Skipped'
                    : 'Not sent'
                  : CHIP[state]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
