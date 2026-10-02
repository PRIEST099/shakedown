'use client'

import { CAST, type PersonaId } from '@shakedown/core/cast'
import { color } from '@shakedown/tokens'
import {
  HERO_TIMING,
  type HeroFrame,
  heroFrame,
  type ImpState,
  PersonaCard,
  PLACEHOLDER_RUN,
  Tape,
} from '@shakedown/ui'
import Link from 'next/link'
import { type CSSProperties, useState } from 'react'
import { useAmbientClock, usePlayhead } from '../../lib/use-playhead'
import { ThemeToggle } from './theme-toggle'

const META = `Sandbox · ${PLACEHOLDER_RUN.store} · run #${PLACEHOLDER_RUN.runId}`

/** Placeholder leak amounts for the card chips. Not real data. */
const CARD_AMOUNTS: Record<PersonaId, number> = {
  'double-clicker': -3600,
  'cart-shuffler': -9900,
  echo: -1200,
  bouncer: -4200,
  'policy-lawyer': -1800,
  'second-opinion': -2400,
}

const STATES: readonly ImpState[] = ['idle', 'running', 'leak', 'sealed', 'inconclusive']
const STATE_LABEL: Record<ImpState, string> = {
  idle: 'Waiting',
  running: 'Running',
  leak: 'Leak',
  sealed: 'Sealed',
  inconclusive: 'Inconclusive',
}

const SWATCHES = [
  { name: 'Ink', hex: color.ink, role: 'Text and the primary button' },
  { name: 'Paper', hex: color.paper, role: 'The page and the Tape' },
  { name: 'Red Ink', hex: color.red600, role: 'Would have leaked' },
  { name: 'Seal', hex: color.seal600, role: 'Sealed' },
  { name: 'Highlighter', hex: color.highlighter, role: 'Look here, running' },
]

type CastState = Record<PersonaId, { state: ImpState; since: number }>

const castInState = (state: ImpState, since: number) =>
  Object.fromEntries(CAST.map((p) => [p.id, { state, since }])) as CastState

function Mark() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path d="M5.5 5.5 L4.6 1.8 L8.6 5 Z M18.5 5.5 L19.4 1.8 L15.4 5 Z" fill="currentColor" />
      <path
        d="M5 5 H19 V20 L17 22 L15 20 L13 22 L11 20 L9 22 L7 20 L5 22 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 9 H16 M8 12 H13.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M8 16 H16" stroke="var(--sd-leak)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function HeroTapes({
  frame,
  reduced,
  onSeal,
}: {
  frame: HeroFrame
  reduced: boolean
  onSeal: () => void
}) {
  if (reduced) {
    const printed = heroFrame(PLACEHOLDER_RUN, HERO_TIMING.tearAt - 1)
    const sealed = heroFrame(PLACEHOLDER_RUN, HERO_TIMING.endMs)
    return (
      <div className="grid w-full gap-6 sm:grid-cols-2">
        <Tape meta={META} lines={PLACEHOLDER_RUN.before} total={printed.before.total} tone="leak" />
        <Tape
          meta={META}
          lines={PLACEHOLDER_RUN.after}
          total={sealed.after.total}
          tone="sealed"
          stamp={{ text: 'SEALED', progress: 1 }}
        />
      </div>
    )
  }
  return (
    <div className="grid w-full max-w-[380px] [&>*]:[grid-area:1/1]">
      {frame.afterVisible ? (
        <Tape
          meta={META}
          lines={PLACEHOLDER_RUN.after}
          lineFrames={frame.after.lines}
          total={frame.after.total}
          tone="sealed"
          shakePx={frame.after.shakePx}
          stamp={{ text: 'SEALED', progress: frame.stamp }}
        />
      ) : null}
      {frame.before.tear < 1 ? (
        <Tape
          meta={META}
          lines={PLACEHOLDER_RUN.before}
          lineFrames={frame.before.lines}
          total={frame.before.total}
          tone="leak"
          tear={frame.before.tear}
          action={
            <button
              type="button"
              className="seal-chip"
              style={{ '--sweep': frame.before.emphasis.toFixed(3) } as CSSProperties}
              onClick={onSeal}
            >
              Seal it →
            </button>
          }
        />
      ) : null}
    </div>
  )
}

export function PreviewClient() {
  const hero = usePlayhead(HERO_TIMING.endMs)
  const [motionOn, setMotionOn] = useState(true)
  const animate = motionOn && !hero.reducedMotion
  const clock = useAmbientClock(animate)
  const [cast, setCast] = useState<CastState>(() => castInState('idle', 0))
  const frame = heroFrame(PLACEHOLDER_RUN, hero.t)

  const uniform = new Set(Object.values(cast).map((c) => c.state))
  const allState = uniform.size === 1 ? [...uniform][0] : undefined

  const cycle = (id: PersonaId) =>
    setCast((prev) => {
      const next = STATES[(STATES.indexOf(prev[id].state) + 1) % STATES.length] ?? 'idle'
      return { ...prev, [id]: { state: next, since: clock } }
    })

  return (
    <>
      <header className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 pt-6 sm:px-6">
        <Link href="/" className="wordmark inline-flex items-center gap-2">
          <Mark />
          shakedown
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="label">Phase 0 · design preview</span>
          <ThemeToggle />
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={!motionOn}
            onClick={() => setMotionOn((on) => !on)}
          >
            {motionOn ? 'Pause motion' : 'Play motion'}
          </button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="label">
              Sandbox-only QA for <span className="mark-paypal">PayPal</span> checkouts and AI
              support agents
            </p>
            <h1 className="display-xl mt-4">
              Meet your <span className="swipe">customers from hell.</span> In the sandbox.
            </h1>
            <p className="mt-6 max-w-[56ch] text-lg text-muted">
              Six test customers run your own PayPal sandbox checkout and AI support agent. They
              double-click, swap carts, replay webhooks and argue your refund policy. You get a
              receipt for every dollar that would have leaked, read from PayPal’s sandbox ledger,
              plus the fix.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" onClick={() => hero.playFrom(0)}>
                Replay the receipt
              </button>
              <span className="code-chip">$ npx @shakedown-dev/cli run</span>
            </div>
            <p className="mt-4 text-sm text-subtle">
              Sandbox only · Your own credentials · PayPal’s ledger keeps the score
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <HeroTapes
              frame={frame}
              reduced={hero.reducedMotion}
              onSeal={() => hero.playFrom(HERO_TIMING.tearAt)}
            />
            <p className="text-sm text-subtle">
              {PLACEHOLDER_RUN.label} ·{' '}
              <button type="button" className="link-btn" onClick={() => hero.playFrom(0)}>
                Replay ↺
              </button>
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="label">The cast</p>
              <h2 className="display-l mt-2">Meet the regulars.</h2>
              <p className="mt-3 max-w-[60ch] text-muted">
                Six customers from hell, each testing one property of your integration. Their horns
                go red when they find a leak, and they sulk when you seal it.
              </p>
            </div>
            <fieldset className="seg">
              <legend className="sd-sr-only">Show every card as</legend>
              {STATES.map((state) => (
                <button
                  key={state}
                  type="button"
                  className="seg-btn"
                  aria-pressed={allState === state}
                  onClick={() => setCast(castInState(state, clock))}
                >
                  {STATE_LABEL[state]}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CAST.map((persona) => {
              const entry = cast[persona.id]
              return (
                <div key={persona.id} className="flex flex-col gap-2">
                  <PersonaCard
                    persona={persona.id}
                    state={entry.state}
                    amountCents={CARD_AMOUNTS[persona.id]}
                    t={clock}
                    stateT={animate ? clock - entry.since : 10_000}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost self-start"
                    onClick={() => cycle(persona.id)}
                  >
                    Next state ↻
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
          <p className="label">Design tokens</p>
          <h2 className="display-l mt-2">Only money gets color.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {SWATCHES.map((s) => (
              <li key={s.name} className="rounded-[10px] border border-line bg-surface p-3">
                <div className="h-16 rounded-md border border-line" style={{ background: s.hex }} />
                <p className="mt-3 font-semibold">{s.name}</p>
                <p className="font-mono text-sm text-muted">{s.hex}</p>
                <p className="text-sm text-subtle">{s.role}</p>
              </li>
            ))}
          </ul>
          <div className="mt-10 grid gap-3">
            <p className="display-l">Bricolage Grotesque, for headlines</p>
            <p className="text-lg">Public Sans, for the interface and body copy.</p>
            <p className="font-mono">IBM Plex Mono · −$153.00 · CAP-5O19 · zero vs O: 0 O</p>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-[1200px] px-4 pb-16 text-sm text-subtle sm:px-6">
        All amounts and IDs on this page are placeholders. Shakedown is an independent project and
        is not affiliated with or endorsed by PayPal.
      </footer>
    </>
  )
}
