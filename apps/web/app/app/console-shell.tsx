'use client'

import type { AgAiTelemetryObserver } from 'ag-studio'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LIVE_CAST, runLabel } from '../../lib/console/labels'
import type { LiveEvent } from '../../lib/console/live'
import type { CampaignRow, CheckRow, ConsoleTables } from '../../lib/console/rows'
import { ThemeToggle } from '../_components/theme-toggle'
import { PocketReceipt } from './pocket-receipt'
import { DAY, NIGHT } from './studio/shift'

const ConsoleStudio = dynamic(() => import('./console-studio').then((m) => m.ConsoleStudio), {
  ssr: false,
  loading: () => <p className="sd-console__loading">Loading the console…</p>,
})

/** Haiku 4.5 list prices per million tokens, for the running estimate shown in the bar. */
const PRICE = { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 }

interface LiveState {
  id?: string
  switches?: string
  status: 'starting' | 'running' | 'done' | 'failed'
  now?: string
  leaks: number
  message?: string
}

function useShift() {
  const [shift, setShift] = useState<typeof DAY | typeof NIGHT>(DAY)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const read = () => {
      const chosen = document.documentElement.dataset.theme
      setShift(chosen === 'dark' || (!chosen && media.matches) ? NIGHT : DAY)
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    media.addEventListener('change', read)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', read)
    }
  }, [])
  return shift
}

function useWide() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    // AG Studio needs 720 px; a phone gets the pocket receipt instead.
    const media = window.matchMedia('(min-width: 720px)')
    const read = () => setWide(media.matches)
    read()
    media.addEventListener('change', read)
    return () => media.removeEventListener('change', read)
  }, [])
  return wide
}

export function ConsoleShell({
  initial,
  aiReady,
  liveReady,
}: {
  initial: ConsoleTables
  aiReady: boolean
  liveReady: boolean
}) {
  const [tables, setTables] = useState(initial)
  const [live, setLive] = useState<LiveState>()
  const [spend, setSpend] = useState({ turns: 0, usd: 0 })
  const source = useRef<EventSource | null>(null)
  const shift = useShift()
  const wide = useWide()
  // Why live runs can't work right now, if they can't: the recorded runs are still all here.
  const [offline, setOffline] = useState<string>()

  useEffect(() => () => source.current?.close(), [])
  useEffect(() => {
    if (!liveReady) return
    fetch('/api/console/status', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ live: boolean; reason?: string }>) : null))
      .then((status) => {
        if (!status || status.live) return
        setOffline(
          status.reason === 'paypal'
            ? 'PayPal’s sandbox isn’t answering, so live runs are paused.'
            : status.reason === 'store'
              ? 'The demo store isn’t answering, so live runs are paused.'
              : 'Live runs aren’t switched on here.',
        )
      })
      .catch(() => {})
  }, [liveReady])

  const refresh = useCallback(async () => {
    const res = await fetch('/api/console/data', { cache: 'no-store' })
    if (res.ok) setTables((await res.json()) as ConsoleTables)
  }, [])

  // A live run shows up as it happens: a provisional campaign row, then each leak as it lands.
  const handle = useCallback(
    (event: LiveEvent) => {
      if (event.type === 'started') {
        const row: CampaignRow = {
          campaign_id: event.campaignId,
          // Named as the stored run will be, so a run filter keeps holding it when it finishes.
          run_label: runLabel({
            id: event.campaignId,
            startedAt: event.startedAt,
            switches: event.mode,
          }),
          started_at: event.startedAt,
          target: 'Leaky Llama',
          source: 'live',
          switches: event.switches,
          cast: LIVE_CAST.join(','),
          verdict: 'RUNNING',
          leaks: 0,
          sealed_checks: 0,
          inconclusive_checks: 0,
          skipped_scenarios: 0,
          merchant_leak_usd: 0,
          customer_harm_usd: 0,
          at_risk_usd: 0,
          seed: 2026,
        }
        setTables((t) => ({ ...t, campaigns: [row, ...t.campaigns] }))
        setLive({ id: event.campaignId, switches: event.switches, status: 'running', leaks: 0 })
      } else if (event.type === 'scenario') {
        setLive((l) =>
          l
            ? {
                ...l,
                now: `${event.state === 'running' ? '›' : event.state === 'skipped' ? '–' : '·'} ${event.title}`,
              }
            : l,
        )
      } else if (event.type === 'leak') {
        const { row } = event
        const check: CheckRow = {
          check_id: `${row.finding_key}:live`,
          campaign_id: row.campaign_id,
          persona_id: row.persona_id,
          persona: row.persona,
          scenario: row.scenario,
          check: row.check,
          verdict: 'Leak',
          severity: row.severity,
          finding_key: row.finding_key,
          detail: row.detail,
          merchant_leak_usd: row.merchant_leak_usd,
          customer_harm_usd: row.customer_harm_usd,
          at_risk_usd: row.at_risk_usd,
        }
        setTables((t) => ({
          ...t,
          findings: [...t.findings, row],
          checks: [...t.checks, check],
          campaigns: t.campaigns.map((c) =>
            c.campaign_id === row.campaign_id
              ? {
                  ...c,
                  leaks: c.leaks + 1,
                  merchant_leak_usd: c.merchant_leak_usd + row.merchant_leak_usd,
                  customer_harm_usd: c.customer_harm_usd + row.customer_harm_usd,
                  at_risk_usd: c.at_risk_usd + row.at_risk_usd,
                }
              : c,
          ),
        }))
        setLive((l) => (l ? { ...l, leaks: l.leaks + 1 } : l))
      } else if (event.type === 'retry') {
        // The customer is running again from the start: drop what it reported the first time.
        setTables((t) => {
          const dropped = t.findings.filter(
            (f) => f.campaign_id === event.campaignId && f.persona_id === event.persona,
          )
          if (dropped.length === 0) return t
          const sum = (key: 'merchant_leak_usd' | 'customer_harm_usd' | 'at_risk_usd') =>
            dropped.reduce((total, f) => total + f[key], 0)
          return {
            ...t,
            findings: t.findings.filter((f) => !dropped.includes(f)),
            checks: t.checks.filter(
              (c) => !(c.campaign_id === event.campaignId && c.persona_id === event.persona),
            ),
            campaigns: t.campaigns.map((c) =>
              c.campaign_id === event.campaignId
                ? {
                    ...c,
                    leaks: c.leaks - dropped.length,
                    merchant_leak_usd: c.merchant_leak_usd - sum('merchant_leak_usd'),
                    customer_harm_usd: c.customer_harm_usd - sum('customer_harm_usd'),
                    at_risk_usd: c.at_risk_usd - sum('at_risk_usd'),
                  }
                : c,
            ),
          }
        })
        setLive((l) => (l ? { ...l, now: '↻ running a customer again' } : l))
      } else if (event.type === 'stored' || event.type === 'failed') {
        source.current?.close()
        source.current = null
        setLive((l) => ({
          ...l,
          leaks: l?.leaks ?? 0,
          status: event.type === 'stored' ? 'done' : 'failed',
          message: event.type === 'failed' ? event.reason : undefined,
          now: undefined,
        }))
        void refresh()
      }
    },
    [refresh],
  )

  const run = useCallback(
    async (switches: 'leaky' | 'sealed') => {
      setLive({ status: 'starting', leaks: 0, switches })
      const res = await fetch('/api/console/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shakedown-console': '1' },
        body: JSON.stringify({ switches }),
      })
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok || !body.id) {
        setLive({ status: 'failed', leaks: 0, message: body.error ?? `HTTP ${res.status}` })
        return
      }
      source.current?.close()
      const stream = new EventSource(`/api/console/campaigns/${body.id}/events`)
      stream.onmessage = (message) => handle(JSON.parse(message.data) as LiveEvent)
      stream.onerror = () => {
        if (stream.readyState === EventSource.CLOSED) source.current = null
      }
      source.current = stream
    },
    [handle],
  )

  const observer = useMemo<AgAiTelemetryObserver>(
    () => ({
      onEvent(event) {
        if (event.type !== 'turn_finished' || !event.usage) return
        const u = event.usage
        const cached = u.cachedInputTokens ?? 0
        const written = u.cacheWriteTokens ?? 0
        const fresh = Math.max(0, u.inputTokens - cached - written)
        const usd =
          (fresh * PRICE.input +
            written * PRICE.cacheWrite +
            cached * PRICE.cacheRead +
            u.outputTokens * PRICE.output) /
          1_000_000
        setSpend((s) => ({ turns: s.turns + 1, usd: s.usd + usd }))
      },
    }),
    [],
  )

  const running = live?.status === 'starting' || live?.status === 'running'
  return (
    <div className="sd-console">
      <header className="sd-console__bar">
        <a className="sd-console__brand" href="/">
          SHAKEDOWN <span>console</span>
        </a>
        <span className="sd-console__sandbox">PayPal sandbox only</span>
        <div className="sd-console__live" aria-live="polite">
          {live?.status === 'running' ? (
            <span className="sd-console__status">
              Running {live.switches} · {live.leaks} {live.leaks === 1 ? 'leak' : 'leaks'} so far
              {live.now ? <span className="sd-console__now">{live.now}</span> : null}
            </span>
          ) : live?.status === 'done' ? (
            <span className="sd-console__status">
              Stored · {live.leaks} {live.leaks === 1 ? 'leak' : 'leaks'}
            </span>
          ) : live?.status === 'failed' ? (
            <span className="sd-console__status is-error">{live.message}</span>
          ) : offline ? (
            <span className="sd-console__status">{offline}</span>
          ) : null}
        </div>
        {liveReady ? (
          <div className="sd-console__actions">
            <button
              type="button"
              disabled={running || Boolean(offline)}
              onClick={() => run('leaky')}
            >
              Run leaky
            </button>
            <button
              type="button"
              disabled={running || Boolean(offline)}
              onClick={() => run('sealed')}
            >
              Run sealed
            </button>
          </div>
        ) : null}
        <span
          className="sd-console__spend"
          title="Claude spend for Triage in this tab, estimated from token counts"
        >
          {aiReady
            ? `Triage ≈ $${spend.usd.toFixed(4)} · ${spend.turns} ${spend.turns === 1 ? 'turn' : 'turns'}`
            : 'Triage needs ANTHROPIC_API_KEY'}
        </span>
        <ThemeToggle />
      </header>
      <main className="sd-console__main">
        {wide ? (
          <ConsoleStudio tables={tables} shift={shift} aiReady={aiReady} observer={observer} />
        ) : null}
        <PocketReceipt tables={tables} />
      </main>
    </div>
  )
}
