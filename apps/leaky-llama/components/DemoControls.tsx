'use client'

import { CAST, type PersonaId } from '@shakedown/core/cast'
import { type Seal, type StoreMode, sealedCount } from '@shakedown/core/mode'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The demo strip. Six switches, one per property the cast tests. Each switch is either the way
 * integrations commonly ship (leaky) or the documented fix (sealed). They apply to orders this
 * browser places from now on; every order keeps the switches it was placed under.
 */
export function DemoControls({ initial }: { initial: StoreMode }) {
  const [mode, setMode] = useState(initial)
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const sealed = sealedCount(mode)

  const send = async (body: object, next: StoreMode) => {
    setMode(next)
    await fetch('/api/mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    startTransition(() => router.refresh())
  }

  const flip = (persona: PersonaId, seal: Seal) =>
    send({ persona, seal }, { ...mode, [persona]: seal })
  const setAll = (seal: Seal) =>
    send({ all: seal }, Object.fromEntries(CAST.map((p) => [p.id, seal])) as StoreMode)

  return (
    <div className="bg-night text-sand">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 text-xs sm:px-6">
        <p className="font-mono tracking-wide">
          <span
            className="mr-2 inline-block h-2 w-2 rounded-full bg-leak align-middle"
            aria-hidden="true"
          />
          DEMO STORE · PAYPAL SANDBOX · NO REAL MONEY
          <span className="ml-2 hidden text-sand/60 sm:inline">
            Built to be tested by Shakedown.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="leak-switches"
          className="rounded-full border border-sand/25 px-3 py-1 font-mono hover:border-sand/60"
        >
          Leak switches: <span className="text-leak">{6 - sealed} leaky</span> ·{' '}
          <span className="text-seal">{sealed} sealed</span> {open ? '▴' : '▾'}
        </button>
      </div>

      {open && (
        <section id="leak-switches" className="border-t border-sand/10">
          <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAST.map((persona) => {
                const seal = mode[persona.id]
                return (
                  <fieldset key={persona.id} className="rounded-lg border border-sand/15 p-3">
                    <legend className="sr-only">{persona.name}</legend>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] text-sand/55">
                          {persona.number} · {persona.tests.toUpperCase()}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold">{persona.name}</p>
                      </div>
                      <div className="flex shrink-0 overflow-hidden rounded-full border border-sand/25 font-mono text-[11px]">
                        {(['leaky', 'sealed'] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={seal === option}
                            onClick={() => flip(persona.id, option)}
                            className={
                              seal === option
                                ? option === 'leaky'
                                  ? 'bg-leak px-2.5 py-1 font-semibold text-night'
                                  : 'bg-seal px-2.5 py-1 font-semibold text-night'
                                : 'px-2.5 py-1 text-sand/70 hover:text-sand'
                            }
                          >
                            {option === 'leaky' ? 'Leaky' : 'Sealed'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-sand/70">
                      {seal === 'sealed' ? `Fixed: ${persona.fix}` : persona.oneLiner}
                    </p>
                  </fieldset>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setAll('leaky')}
                className="rounded-full border border-leak/60 px-3 py-1 text-leak hover:bg-leak/10"
              >
                All leaky
              </button>
              <button
                type="button"
                onClick={() => setAll('sealed')}
                className="rounded-full border border-seal/60 px-3 py-1 text-seal hover:bg-seal/10"
              >
                All sealed
              </button>
              <p className="text-sand/55">
                Applies to orders this browser places from now on. Each order keeps the switches it
                was placed under. Card name <span className="font-mono">CCREJECT-REFUSED</span>{' '}
                makes the sandbox decline the card.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
