import type { CSSProperties, ReactNode } from 'react'
import { formatCents, MINUS } from './format'
import { clamp01, ease, lerp } from './timeline'

export interface LedgerNumberProps {
  fromCents: number
  toCents: number
  /** Linear 0 → 1. Each digit rolls from its old value to its new one. */
  progress?: number
  className?: string
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/** A frame-drivable odometer for money. Tabular mono digits, true minus sign, no layout jumps. */
export function LedgerNumber({ fromCents, toCents, progress = 1, className }: LedgerNumberProps) {
  const p = ease.standard(clamp01(progress))
  const a = Math.abs(Math.round(fromCents))
  const b = Math.abs(Math.round(toCents))
  const sa = String(a).padStart(3, '0')
  const sb = String(b).padStart(3, '0')
  const len = Math.max(sa.length, sb.length)
  const da = sa.padStart(len, ' ')
  const db = sb.padStart(len, ' ')

  const signFrom = fromCents < 0 && a > 0 ? 1 : 0
  const signTo = toCents < 0 && b > 0 ? 1 : 0
  const signWidth = lerp(signFrom, signTo, p)

  const cells: ReactNode[] = []
  for (let i = 0; i < len; i++) {
    const ca = da[i] ?? ' '
    const cb = db[i] ?? ' '
    const presentA = ca !== ' '
    const presentB = cb !== ' '
    if (!presentA && !presentB) continue
    const width = presentA && presentB ? 1 : presentB ? p : 1 - p
    const position = lerp(presentA ? Number(ca) : 0, presentB ? Number(cb) : 0, p)
    const placeFromRight = len - 3 - i // 0 = the ones place of dollars
    if (i === len - 2) {
      cells.push(
        <span key="point" className="sd-ledger__sep">
          .
        </span>,
      )
    }
    cells.push(
      <span
        key={`d${i}`}
        className="sd-ledger__digit"
        style={{ '--w': width.toFixed(4) } as CSSProperties}
      >
        <span className="sd-ledger__strip" style={{ transform: `translateY(${-position}em)` }}>
          {DIGITS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </span>
      </span>,
    )
    if (placeFromRight > 0 && placeFromRight % 3 === 0) {
      cells.push(
        <span
          key={`c${i}`}
          className="sd-ledger__sep sd-ledger__sep--comma"
          style={{ '--w': width.toFixed(4) } as CSSProperties}
        >
          ,
        </span>,
      )
    }
  }

  return (
    <span className={['sd-ledger', className].filter(Boolean).join(' ')}>
      <span className="sd-sr-only">{formatCents(toCents)}</span>
      <span className="sd-ledger__visual" aria-hidden="true">
        <span className="sd-ledger__sign" style={{ '--w': signWidth.toFixed(4) } as CSSProperties}>
          {MINUS}
        </span>
        <span>$</span>
        {cells}
      </span>
    </span>
  )
}
