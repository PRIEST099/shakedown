import { motion } from '@shakedown/tokens'
import { type RunFixture, totalCents } from './fixtures'
import { ease, shakeAt, springAt, windowProgress } from './timeline'

/** Hero choreography (DESIGN_SPEC §3.1): print, tick, tear, re-print sealed, roll to $0.00, stamp. */
export const HERO_TIMING = {
  lineStarts: [300, 1000, 1600, 2100],
  lineGapMs: 600,
  pulseMs: 240,
  emphasisAt: 2800,
  tearAt: 3300,
  rollAt: 3900,
  rollMs: 600,
  stampAt: 4500,
  endMs: 4900,
} as const

export interface LineFrame {
  /** 0 → 1 as the line prints. */
  print: number
  shakePx: number
  /** 1 → 0: the one-time red-tint pulse on a leak line. */
  pulse: number
}

export interface TotalFrame {
  fromCents: number
  toCents: number
  /** Linear progress of the current tick; LedgerNumber applies the easing. */
  progress: number
}

export interface HeroFrame {
  before: { lines: LineFrame[]; total: TotalFrame; tear: number; emphasis: number }
  after: { lines: LineFrame[]; total: TotalFrame; shakePx: number }
  afterVisible: boolean
  stamp: number
  done: boolean
}

export function lineStart(index: number): number {
  const starts: readonly number[] = HERO_TIMING.lineStarts
  const known = starts[index]
  if (known !== undefined) return known
  const last = starts[starts.length - 1] ?? 0
  return last + (index - starts.length + 1) * HERO_TIMING.lineGapMs
}

/** Everything the hero needs to render at time `t` (ms). Pure: same input, same frame. */
export function heroFrame(run: RunFixture, t: number): HeroFrame {
  const { ms, staggerMs, spring } = motion

  const beforeLines = run.before.map((line, i): LineFrame => {
    const start = lineStart(i)
    const isLeak = line.verdict === 'leak' && line.amountCents !== 0
    return {
      print: ease.print(windowProgress(t, start, ms.sm)),
      shakePx: isLeak ? shakeAt(t, start + ms.sm) : 0,
      pulse: isLeak ? 1 - windowProgress(t, start, HERO_TIMING.pulseMs) : 0,
    }
  })

  // The total ticks once per leak line, never continuously.
  let total: TotalFrame = { fromCents: 0, toCents: 0, progress: 1 }
  let running = 0
  run.before.forEach((line, i) => {
    if (line.amountCents === 0) return
    const start = lineStart(i)
    if (t >= start) {
      total = {
        fromCents: running,
        toCents: running + line.amountCents,
        progress: windowProgress(t, start, ms.lg),
      }
    }
    running += line.amountCents
  })

  const leaked = totalCents(run.before)
  const sealed = totalCents(run.after)

  const afterLines = run.after.map(
    (_, i): LineFrame => ({
      print: ease.print(windowProgress(t, HERO_TIMING.tearAt + i * staggerMs.line, ms.sm)),
      shakePx: 0,
      pulse: 0,
    }),
  )

  return {
    before: {
      lines: beforeLines,
      total,
      tear: ease.tear(windowProgress(t, HERO_TIMING.tearAt, ms.md)),
      emphasis: windowProgress(t, HERO_TIMING.emphasisAt, ms.md),
    },
    after: {
      lines: afterLines,
      total: {
        fromCents: leaked,
        toCents: sealed,
        progress: windowProgress(t, HERO_TIMING.rollAt, HERO_TIMING.rollMs),
      },
      shakePx: shakeAt(t, HERO_TIMING.stampAt),
    },
    afterVisible: t >= HERO_TIMING.tearAt,
    stamp: springAt(t - HERO_TIMING.stampAt, spring.stamp),
    done: t >= HERO_TIMING.endMs,
  }
}
