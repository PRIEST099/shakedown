'use client'

import type { PersonaId } from '@shakedown/core'
import { getPersona } from '@shakedown/core/cast'
import type { AgWidgetParams } from 'ag-studio'
import { latest, readTable, toTime, usd, useWidgetData } from '../table-data'

interface Entry extends Record<string, unknown> {
  entry_key: string
  campaign_id: string
  persona_id: PersonaId
  scenario: string
  seq: number
  kind: string
  at: unknown
  summary: string
  paypal_id: string | null
  amount_usd: number | null
  cited: boolean
}

const KIND: Record<string, string> = {
  checkout: 'Checkout',
  card: 'Card',
  capture: 'Capture',
  'paypal-order': 'PayPal',
  'paypal-refund': 'PayPal',
  delivery: 'Webhook',
  probe: 'Store',
  'order-opened': 'Order',
  chat: 'Support',
  fixture: 'Fixture',
  note: 'Note',
}

const clock = (value: unknown) => {
  const time = toTime(value)
  return time ? new Date(time).toISOString().slice(11, 19) : ''
}

/**
 * The ledger as a tape: every exchange of the latest run in view, in order, grouped by scenario.
 * The entries a finding quotes as evidence are marked, so a reader can follow a leak from the
 * first click to PayPal's own record of it.
 */
export function LedgerTapeWidget(params: AgWidgetParams) {
  const data = useWidgetData(
    params,
    async (api) => {
      const [campaigns, entries] = await Promise.all([
        readTable(api, 'campaigns', ['campaign_id', 'started_at', 'run_label', 'verdict']),
        readTable<Entry>(
          api,
          'ledger',
          [
            'entry_key',
            'campaign_id',
            'persona_id',
            'scenario',
            'seq',
            'kind',
            'at',
            'summary',
            'paypal_id',
            'amount_usd',
            'cited',
          ],
          { sortBy: { id: 'seq', direction: 'asc' }, limit: 2000 },
        ),
      ])
      const run = campaigns && latest(campaigns)
      if (!run) return undefined
      const mine = (entries ?? [])
        .filter((e) => e.campaign_id === run.campaign_id)
        .sort((a, b) => Number(a.seq) - Number(b.seq))
      const groups: { scenario: string; persona: PersonaId; entries: Entry[] }[] = []
      for (const entry of mine) {
        const last = groups.at(-1)
        if (last && last.scenario === entry.scenario && last.persona === entry.persona_id) {
          last.entries.push(entry)
        } else
          groups.push({ scenario: entry.scenario, persona: entry.persona_id, entries: [entry] })
      }
      return {
        groups,
        label: String(run.run_label),
        count: mine.length,
        running: run.verdict === 'RUNNING',
      }
    },
    (value) => value.count === 0 && !value.running,
  )
  if (!data) return null
  if (data.running && data.count === 0) {
    return (
      <div className="sd-widget sd-ltape">
        <p className="sd-ltape__meta">
          {data.label}: the full ledger lands here when the run is stored.
        </p>
      </div>
    )
  }

  return (
    <div className="sd-widget sd-ltape">
      <p className="sd-ltape__meta">
        {data.count} entries · {data.label}
      </p>
      {data.groups.map((group) => (
        <section
          key={`${group.persona}:${group.scenario}:${group.entries[0]?.seq}`}
          className="sd-ltape__group"
        >
          <h4 className="sd-ltape__scenario">
            {getPersona(group.persona).shortName} · {group.scenario}
          </h4>
          <ol className="sd-ltape__entries">
            {group.entries.map((entry) => (
              <li
                key={entry.entry_key}
                className={entry.cited ? 'sd-ltape__entry is-cited' : 'sd-ltape__entry'}
              >
                <span className="sd-ltape__time">{clock(entry.at)}</span>
                <span className={`sd-ltape__kind is-${entry.kind}`}>
                  {KIND[entry.kind] ?? entry.kind}
                </span>
                <span className="sd-ltape__summary">
                  {entry.summary}
                  {entry.paypal_id ? <code className="sd-ltape__id">{entry.paypal_id}</code> : null}
                </span>
                <span className="sd-ltape__amount">
                  {entry.amount_usd === null || entry.amount_usd === undefined
                    ? ''
                    : usd(entry.amount_usd)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
