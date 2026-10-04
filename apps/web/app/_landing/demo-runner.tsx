'use client'

import { CAST, type PersonaId } from '@shakedown/core/cast'
import { formatCents, type RunLine, Tape } from '@shakedown/ui'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveEvent } from '../../lib/console/live'
import type { ConsoleTables } from '../../lib/console/rows'
import { type PersonaResult, useDemo } from './demo-context'

/** The customers a demo run sends: the four that need no AI. */
const SENT: readonly PersonaId[] = ['double-clicker', 'cart-shuffler', 'echo', 'bouncer']

type Chip = 'queued' | 'running' | 'leak' | 'sealed' | 'inconclusive' | 'skipped'
type Phase = 'idle' | 'starting' | 'running' | 'done' | 'failed' | 'replay'

/** Why live runs can't work right now, from /api/console/status. */
type Unavailable = 'off' | 'setup' | 'store' | 'paypal'

const UNAVAILABLE: Record<Unavailable, string> = {
  paypal: 'PayPal’s sandbox isn’t answering right now, so here is a recording of a real run.',
  store: 'The demo store isn’t answering right now, so here is a recording of a real run.',
  off: 'Live runs aren’t switched on here, so here is a recording of a real run.',
  setup: 'Live runs aren’t switched on here, so here is a recording of a real run.',
}

interface RunInfo {
  id: string
  switches: string
  startedAt: number
}

const CHIP_WORD: Record<Chip, string> = {
  queued: 'queued',
  running: 'running…',
  leak: 'LEAK',
  sealed: 'SEALED',
  inconclusive: 'INCONCLUSIVE',
  skipped: 'skipped',
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** A total that ticks once per change, never continuously (DESIGN_SPEC §2.12). */
function useTick(target: number) {
  const [state, setState] = useState({ from: target, to: target, progress: 1 })
  const last = useRef(target)
  useEffect(() => {
    if (target === last.current) return
    const from = last.current
    last.current = target
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setState({ from: target, to: target, progress: 1 })
      return
    }
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 600)
      setState({ from, to: target, progress })
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return state
}

export interface RecordedRun {
  label: string
  store: string
  runId: string
  before: readonly RunLine[]
  after: readonly RunLine[]
}

export function DemoRunner({ recorded }: { recorded: RecordedRun }) {
  const { setResults, runRequests } = useDemo()
  const [phase, setPhase] = useState<Phase>('idle')
  const [run, setRun] = useState<RunInfo>()
  const [chips, setChips] = useState<Partial<Record<PersonaId, Chip>>>({})
  const [lines, setLines] = useState<RunLine[]>([])
  const [message, setMessage] = useState<string>()
  const [lastLeaky, setLastLeaky] = useState<number>()
  const [now, setNow] = useState(0)
  const [unavailable, setUnavailable] = useState<Unavailable>()
  const source = useRef<EventSource | null>(null)
  const handled = useRef(0)

  const total = lines.reduce((sum, line) => sum + line.amountCents, 0)
  const tick = useTick(total)

  useEffect(() => () => source.current?.close(), [])
  useEffect(() => {
    fetch('/api/console/status', { cache: 'no-store' })
      .then((res) =>
        res.ok ? (res.json() as Promise<{ live: boolean; reason?: Unavailable }>) : null,
      )
      .then((status) => {
        if (status && !status.live) setUnavailable(status.reason ?? 'off')
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (phase !== 'running' && phase !== 'starting') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [phase])

  const finish = useCallback(
    async (campaignId: string) => {
      source.current?.close()
      source.current = null
      try {
        const res = await fetch('/api/console/data', { cache: 'no-store' })
        const tables = (await res.json()) as ConsoleTables
        const checks = tables.checks.filter((check) => check.campaign_id === campaignId)
        const results: Partial<Record<PersonaId, PersonaResult>> = {}
        const nextChips: Partial<Record<PersonaId, Chip>> = {}
        const sealedLines: RunLine[] = []
        for (const id of SENT) {
          const mine = checks.filter((check) => check.persona_id === id)
          const leaks = mine.filter((check) => check.verdict === 'Leak')
          const atRisk = leaks.reduce((sum, check) => sum + Math.round(check.at_risk_usd * 100), 0)
          const state: Chip = leaks.length
            ? 'leak'
            : mine.some((check) => check.verdict === 'Inconclusive')
              ? 'inconclusive'
              : mine.length
                ? 'sealed'
                : 'skipped'
          nextChips[id] = state
          if (state !== 'skipped') {
            results[id] = { state: state === 'leak' ? 'leak' : state, amountCents: -atRisk }
          }
          if (state === 'sealed' || state === 'inconclusive') {
            sealedLines.push({
              personaId: id,
              verdict: state,
              amountCents: 0,
              evidence:
                state === 'sealed'
                  ? 'Every check held'
                  : `${mine.filter((c) => c.verdict === 'Inconclusive').length} checks need PayPal-signed events`,
            })
          }
        }
        setChips(nextChips)
        setLines((current) => [...current, ...sealedLines])
        setResults(results)
      } catch {
        setMessage('The run is stored. Open the console to see every detail.')
      }
      setPhase('done')
    },
    [setResults],
  )

  const start = useCallback(
    async (switches: 'leaky' | 'sealed') => {
      source.current?.close()
      if (switches === 'sealed') setLastLeaky(total < 0 ? total : lastLeaky)
      setPhase('starting')
      setMessage(undefined)
      setLines([])
      setChips(Object.fromEntries(SENT.map((id) => [id, 'queued'])))
      setNow(Date.now())
      let res: Response
      try {
        res = await fetch('/api/console/campaigns', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-shakedown-console': '1' },
          body: JSON.stringify({ switches }),
        })
      } catch {
        setPhase('failed')
        setMessage('The demo store didn’t answer. Watch the recorded run instead.')
        return
      }
      const body = (await res.json().catch(() => ({}))) as {
        id?: string
        error?: string
        code?: string
      }
      if (!res.ok || !body.id) {
        setPhase('failed')
        setMessage(
          body.code === 'busy'
            ? 'The cast is busy with other runs. Try again in a minute, or watch the recorded run.'
            : res.status === 429
              ? 'That’s a lot of runs. Try again in a few minutes, or watch the recorded run.'
              : 'Live runs aren’t available here right now. Watch the recorded run instead.',
        )
        return
      }
      const id = body.id
      setRun({ id, switches, startedAt: Date.now() })
      setPhase('running')
      const stream = new EventSource(`/api/console/campaigns/${id}/events`)
      source.current = stream
      stream.onmessage = (message) => {
        const event = JSON.parse(message.data) as LiveEvent
        if (event.type === 'scenario') {
          setChips((current) => ({
            ...current,
            [event.persona]:
              current[event.persona] === 'leak'
                ? 'leak'
                : event.state === 'running'
                  ? 'running'
                  : current[event.persona],
          }))
        } else if (event.type === 'leak') {
          const { row } = event
          setChips((current) => ({ ...current, [row.persona_id]: 'leak' }))
          setLines((current) => {
            const cents = -Math.round(row.at_risk_usd * 100)
            const evidence = [row.check, row.paypal_ids.split(' ')[0]].filter(Boolean).join(' · ')
            const existing = current.find((line) => line.personaId === row.persona_id)
            if (!existing) {
              return [
                ...current,
                { personaId: row.persona_id, verdict: 'leak', amountCents: cents, evidence },
              ]
            }
            return current.map((line) =>
              line === existing
                ? { ...line, amountCents: line.amountCents + cents, evidence }
                : line,
            )
          })
        } else if (event.type === 'retry') {
          // The customer is running again from the start: drop what it printed the first time.
          setChips((current) => ({ ...current, [event.persona]: 'running' }))
          setLines((current) => current.filter((line) => line.personaId !== event.persona))
        } else if (event.type === 'stored') {
          void finish(id)
        } else if (event.type === 'failed') {
          stream.close()
          setPhase('failed')
          setMessage(
            'The PayPal sandbox didn’t answer in time. Try again, or watch the recorded run.',
          )
        }
      }
      stream.onerror = () => {
        if (stream.readyState === EventSource.CLOSED && source.current === stream) {
          source.current = null
        }
      }
    },
    [finish, lastLeaky, total],
  )

  const replay = useCallback(() => {
    source.current?.close()
    setRun(undefined)
    setMessage(undefined)
    setPhase('replay')
    setChips(Object.fromEntries(SENT.map((id) => [id, 'leak'])))
    setLines([...recorded.before])
  }, [recorded.before])

  // When live runs can't work, show the recording straight away, labelled as one.
  useEffect(() => {
    if (unavailable) replay()
  }, [unavailable, replay])

  // The hero's "Run it live" asks for a run: start one, or replay the recording if runs are off.
  useEffect(() => {
    if (runRequests > handled.current) {
      handled.current = runRequests
      if (unavailable) replay()
      else if (phase !== 'running' && phase !== 'starting') void start('leaky')
    }
  }, [runRequests, phase, start, unavailable, replay])

  const reset = () => {
    source.current?.close()
    setPhase('idle')
    setRun(undefined)
    setLines([])
    setChips({})
    setMessage(undefined)
    setLastLeaky(undefined)
  }

  const live = phase === 'running' || phase === 'starting'
  const leaked = lines.some((line) => line.verdict === 'leak')
  const status =
    phase === 'replay'
      ? `Replay of a ${recorded.label.charAt(0).toLowerCase()}${recorded.label.slice(1)}`
      : run
        ? `Live · PayPal sandbox · run ${run.id.replace(/^CMP-/, '').slice(0, 8)} · ${clock((live ? now : Date.now()) - run.startedAt)}`
        : 'Ready when you are.'

  return (
    <div className="demo">
      <div className="demo__controls">
        <div className="demo__buttons">
          {unavailable ? (
            <button type="button" className="btn btn-primary" onClick={replay}>
              Replay the recording
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={live}
              onClick={() => start('leaky')}
            >
              Unleash the cast
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={Boolean(unavailable) || live || phase !== 'done' || !leaked}
            onClick={() => start('sealed')}
          >
            Apply fixes and re-run
          </button>
          <button type="button" className="btn btn-ghost" disabled={live} onClick={reset}>
            Reset
          </button>
        </div>
        <ul className="demo__chips" aria-label="The customers in this run">
          {SENT.map((id) => {
            const chip = chips[id]
            const persona = CAST.find((p) => p.id === id)
            const line = lines.find((l) => l.personaId === id)
            return (
              <li key={id} className={`demo-chip is-${chip ?? 'idle'}`}>
                <span className="demo-chip__name">{persona?.name}</span>
                <span className="demo-chip__state">
                  {chip ? CHIP_WORD[chip] : '·'}
                  {chip === 'leak' && line ? ` ${formatCents(line.amountCents)}` : ''}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="demo__status" aria-live="polite">
          {status}
        </p>
        {unavailable ? <p className="demo__message">{UNAVAILABLE[unavailable]}</p> : null}
        {message ? (
          <p className="demo__message">
            {message}{' '}
            {phase === 'failed' ? (
              <button type="button" className="link-btn" onClick={replay}>
                Watch the recorded run
              </button>
            ) : null}
          </p>
        ) : null}
        <p className="demo__note">
          Runs go to Leaky Llama Supply Co., our deliberately leaky demo store, in the PayPal
          sandbox. The Policy Lawyer talks to an AI support assistant, so it runs from the CLI with
          a budget.
        </p>
        <Link href="/app" className="demo__console">
          Open the full console →
        </Link>
      </div>
      <div className="demo__tape">
        {phase === 'idle' ? (
          <div className="demo__blank" role="img" aria-label="An empty receipt">
            <p className="sd-tape__header">Shakedown · test run</p>
            <p className="demo__blank-text">
              The receipt prints here, one line per leak, as PayPal’s sandbox confirms it.
            </p>
          </div>
        ) : (
          <Tape
            meta={
              live
                ? 'Live · printing receipt…'
                : phase === 'replay'
                  ? recorded.label
                  : `Sandbox · ${recorded.store}`
            }
            lines={lines}
            total={{ fromCents: tick.from, toCents: tick.to, progress: tick.progress }}
            tone={leaked ? 'leak' : 'sealed'}
            stamp={
              phase === 'done' && !leaked && lines.length > 0
                ? { text: 'SEALED', progress: 1 }
                : undefined
            }
          />
        )}
        {phase === 'done' && !leaked && lastLeaky !== undefined ? (
          <p className="demo__was">Was {formatCents(lastLeaky)} before the fixes.</p>
        ) : null}
        <p className="sd-sr-only" aria-live="polite">
          {phase === 'done'
            ? leaked
              ? `Run complete: ${formatCents(total)} would have leaked.`
              : 'Run complete: sealed. $0.00 would have leaked.'
            : ''}
        </p>
      </div>
    </div>
  )
}
