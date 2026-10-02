import { getPersona, type PersonaId } from '@shakedown/core/cast'
import type { CSSProperties } from 'react'
import type { ImpState } from './cast/geometry'
import { Imp } from './cast/Imp'
import { formatCents } from './format'
import { shakeAt } from './timeline'

export interface PersonaCardProps {
  persona: PersonaId
  state?: ImpState
  /** The leak amount to show in the LEAK chip (negative cents). */
  amountCents?: number
  t?: number
  stateT?: number
  className?: string
}

function StateChip({ state, amountCents }: { state: ImpState; amountCents?: number }) {
  switch (state) {
    case 'running':
      return <span className="sd-state sd-state--running">Running…</span>
    case 'leak':
      return (
        <span className="sd-state sd-state--leak">
          <span aria-hidden="true">▼ </span>Leak{' '}
          {amountCents !== undefined ? formatCents(amountCents) : ''}
        </span>
      )
    case 'sealed':
      return <span className="sd-state sd-state--sealed">✓ Sealed</span>
    case 'inconclusive':
      return <span className="sd-state sd-state--inconclusive">? Inconclusive</span>
    default:
      return <span className="sd-state">Waiting</span>
  }
}

/** A cast member's trading card. Its state is driven by real runs in the product. */
export function PersonaCard({
  persona,
  state = 'idle',
  amountCents,
  t = 0,
  stateT = 10_000,
  className,
}: PersonaCardProps) {
  const p = getPersona(persona)
  const shake = state === 'leak' ? shakeAt(stateT, 0) : 0
  const scan = state === 'running' ? (t % 1600) / 1600 : null
  const style = shake
    ? ({ transform: `translateX(${shake.toFixed(2)}px)` } as CSSProperties)
    : undefined

  return (
    <article
      className={['sd-card', `sd-card--${state}`, className].filter(Boolean).join(' ')}
      style={style}
    >
      <header className="sd-card__top">
        <span className="sd-card__no">{String(p.number).padStart(2, '0')}/06</span>
        <span className="sd-card__chip">{p.channel}</span>
      </header>
      <div className="sd-card__art">
        <Imp persona={persona} state={state} t={t} stateT={stateT} background />
        {scan === null ? null : (
          <div
            className="sd-card__scan"
            style={{ transform: `translateX(${(scan * 240 - 40).toFixed(1)}%)` }}
          />
        )}
      </div>
      <h3 className="sd-card__name">{p.name}</h3>
      <p className="sd-card__line">{p.oneLiner}</p>
      <hr className="sd-perf" />
      <dl className="sd-card__meta">
        <div>
          <dt>Tests</dt>
          <dd>{p.tests}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>
            <StateChip state={state} amountCents={amountCents} />
          </dd>
        </div>
      </dl>
    </article>
  )
}
