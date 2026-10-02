import { getPersona } from '@shakedown/core/cast'
import type { CSSProperties, ReactNode } from 'react'
import type { RunLine } from './fixtures'
import { formatCents } from './format'
import type { LineFrame, TotalFrame } from './hero-script'
import { LedgerNumber } from './LedgerNumber'
import { Stamp, type StampText } from './Stamp'

export interface TapeProps {
  /** e.g. "Sandbox · Leaky Llama Supply Co. · run #0042". */
  meta: string
  lines: readonly RunLine[]
  /** Per-line print state. Omit for a fully printed tape. */
  lineFrames?: readonly LineFrame[]
  total: TotalFrame
  totalLabel?: string
  tone: 'leak' | 'sealed'
  stamp?: { text: StampText; progress: number }
  /** 0 → 1: the finished tape lifts and tears away. */
  tear?: number
  shakePx?: number
  /** Rendered under the total, inside the paper (e.g. a "Seal it" button). */
  action?: ReactNode
  className?: string
}

const GLYPH = { leak: '▼', sealed: '✓', inconclusive: '?' } as const
const VERDICT_WORD = { leak: 'Leak', sealed: 'Sealed', inconclusive: 'Inconclusive' } as const
const PRINTED: LineFrame = { print: 1, shakePx: 0, pulse: 0 }

/** The Tape: a receipt that prints each finding with its evidence, then the total. */
export function Tape({
  meta,
  lines,
  lineFrames,
  total,
  totalLabel = 'Would have leaked',
  tone,
  stamp,
  tear = 0,
  shakePx = 0,
  action,
  className,
}: TapeProps) {
  const style: CSSProperties =
    tear > 0
      ? { transform: `rotate(${2 * tear}deg) translateY(${-24 * tear}px)`, opacity: 1 - tear }
      : { transform: shakePx ? `translateX(${shakePx}px)` : undefined }

  return (
    <figure
      className={['sd-tape', `sd-tape--${tone}`, className].filter(Boolean).join(' ')}
      style={style}
    >
      <div className="sd-tape__paper">
        <header className="sd-tape__header">Shakedown · test run</header>
        <p className="sd-tape__meta">{meta}</p>
        <hr className="sd-tape__perf" />
        <ol className="sd-tape__lines">
          {lines.map((line, i) => {
            const frame = lineFrames?.[i] ?? PRINTED
            const persona = getPersona(line.personaId)
            const hidden = 1 - frame.print
            const lineStyle = {
              clipPath: hidden > 0 ? `inset(0 0 ${(hidden * 100).toFixed(2)}% 0)` : undefined,
              transform:
                hidden > 0 || frame.shakePx
                  ? `translate(${frame.shakePx.toFixed(2)}px, ${(-4 * hidden).toFixed(2)}px)`
                  : undefined,
              opacity: frame.print < 1 ? 0.6 + 0.4 * frame.print : undefined,
              '--pulse': frame.pulse.toFixed(3),
            } as CSSProperties
            return (
              <li
                key={line.personaId}
                className={`sd-tape__line is-${line.verdict}`}
                style={lineStyle}
              >
                <div className="sd-tape__row">
                  <span className="sd-tape__glyph" aria-hidden="true">
                    {GLYPH[line.verdict]}
                  </span>
                  <span className="sd-tape__name">
                    <span className="sd-sr-only">{VERDICT_WORD[line.verdict]}: </span>
                    {persona.shortName}
                  </span>
                  <span className="sd-tape__amount">{formatCents(line.amountCents)}</span>
                </div>
                <div className="sd-tape__evidence">{line.evidence}</div>
              </li>
            )
          })}
        </ol>
        <div className="sd-tape__double-rule" />
        <div className="sd-tape__total">
          <span className="sd-tape__total-label">{totalLabel}</span>
          <LedgerNumber
            className="sd-tape__total-value"
            fromCents={total.fromCents}
            toCents={total.toCents}
            progress={total.progress}
          />
        </div>
        {/* A reserved slot: holds the action, or stays blank for the stamp to land in. */}
        {action || stamp ? <div className="sd-tape__slot">{action}</div> : null}
      </div>
      {/* Outside the paper so the tear-edge mask never clips it; overlays the blank slot. */}
      {stamp ? (
        <div className="sd-tape__stamp-slot">
          <Stamp text={stamp.text} progress={stamp.progress} />
        </div>
      ) : null}
    </figure>
  )
}
