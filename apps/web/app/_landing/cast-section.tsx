'use client'

import { CAST, type PersonaId } from '@shakedown/core/cast'
import { PersonaCard } from '@shakedown/ui'
import { useState } from 'react'
import { useDemo } from './demo-context'

/** Built in a later version, so its card says so rather than pretending to have a result. */
const LATER: readonly PersonaId[] = ['second-opinion']

export function CastSection() {
  const { results } = useDemo()
  const [flipped, setFlipped] = useState<PersonaId | null>(null)
  const ran = Object.keys(results).length > 0

  return (
    <section id="cast" className="section" aria-labelledby="cast-title">
      <p className="label">The cast</p>
      <h2 id="cast-title" className="display-l section__title">
        Meet the regulars.
      </h2>
      <p className="section__lede">
        Five test customers, with a sixth on the way. Each one checks one property of your
        integration. All of them are fictional and sandbox-only.
        {ran
          ? ' Their cards show your last demo run.'
          : ' Run the demo below and their cards change.'}
      </p>
      <ul className="cast-grid" aria-label="The six customers">
        {CAST.map((persona) => {
          const result = results[persona.id]
          const later = LATER.includes(persona.id)
          const open = flipped === persona.id
          return (
            <li key={persona.id} className="cast-slot">
              <div className={open ? 'flip is-flipped' : 'flip'}>
                <div className="flip__face flip__front" aria-hidden={open}>
                  <PersonaCard
                    persona={persona.id}
                    state={result?.state ?? 'idle'}
                    amountCents={result?.amountCents}
                    stateT={10_000}
                  />
                </div>
                <div className="flip__face flip__back" aria-hidden={!open}>
                  <p className="label">How to beat them</p>
                  <h3 className="flip__name">{persona.name}</h3>
                  <p className="flip__fix">{persona.fix}</p>
                  <hr className="sd-perf" />
                  <p className="flip__measures">
                    <span className="label">What Shakedown measures</span>
                    {persona.tests}, graded from PayPal’s sandbox ledger.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="flip__toggle"
                aria-expanded={open}
                onClick={() => setFlipped(open ? null : persona.id)}
              >
                {open ? 'Back to the card' : 'How to beat them'}
              </button>
              {later ? <p className="cast-later">Arrives in a later version.</p> : null}
            </li>
          )
        })}
      </ul>
      <p className="section__close">No real customers were harmed, refunded or disputed.</p>
    </section>
  )
}
