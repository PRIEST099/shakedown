/**
 * Where things happen in the cut, worked out from a take's event log: the speed-ramped segments
 * of each piece of footage, and the frames where its leaks print and its receipt seals. The
 * scenes draw from these and scripts/compose.ts scores from them, so picture and sound agree.
 * Plain TypeScript: no React, no Remotion.
 */
import { FPS } from './script'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type TakeEvent =
  | { t: number; type: 'move' | 'click'; x: number; y: number }
  | { t: number; type: 'mark'; label: string; box?: Box; data?: Record<string, string> }

export type Mark = Extract<TakeEvent, { type: 'mark' }>

export type TakeName = 'landing' | 'live-run' | 'console' | 'exhibit' | 'ci'

export interface Take {
  take: TakeName
  durationMs: number
  width: number
  height: number
  events: TakeEvent[]
}

export const markOf = (take: Take | undefined, label: string) =>
  take?.events.find((e): e is Mark => e.type === 'mark' && e.label === label)

/** A mark's time, in seconds into the take. */
export const markAt = (take: Take | undefined, label: string) =>
  (markOf(take, label)?.t ?? 0) / 1000

/** Every receipt line the take printed, or re-printed with a new amount, in order. */
export const linesOf = (take: Take | undefined) =>
  (take?.events ?? []).filter((e): e is Mark => e.type === 'mark' && e.label === 'line')

const cents = (amount: string) => -Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100)

export interface PrintedLeak {
  persona: string
  /** Seconds into the take. */
  t: number
  /** The check that broke, as the receipt printed it. */
  check: string
  /** What this one leak added to the customer's line. */
  amountCents: number
  /** The receipt line it printed on. */
  box?: Box
}

/** The first run's leaks, one per change to the receipt, with what each one cost on its own. */
export function leaksOf(take: Take | undefined): PrintedLeak[] {
  const done = markAt(take, 'run-done') + 2
  const running = new Map<string, number>()
  const out: PrintedLeak[] = []
  for (const line of linesOf(take)) {
    if (line.t / 1000 > done || line.data?.verdict !== 'leak') continue
    const persona = line.data.persona ?? ''
    const total = cents(line.data.amount ?? '0')
    out.push({
      persona,
      t: line.t / 1000,
      check: (line.data.evidence ?? '').split(' · ')[0] ?? '',
      amountCents: total - (running.get(persona) ?? 0),
      box: line.box,
    })
    running.set(persona, total)
  }
  return out
}

// ---------- speed-ramped clips ----------

export interface Segment {
  /** Seconds into the take. */
  from: number
  to: number
  rate: number
}

export interface Placed extends Segment {
  /** Where the segment starts in the clip, and how long it runs, in frames. */
  start: number
  frames: number
}

export function place(segments: readonly Segment[]): Placed[] {
  let start = 0
  return segments.map((segment) => {
    const frames = Math.round(((segment.to - segment.from) / segment.rate) * FPS)
    const placed = { ...segment, start, frames }
    start += frames
    return placed
  })
}

export const lengthOf = (cut: readonly Placed[]) =>
  cut.reduce((sum, segment) => sum + segment.frames, 0)

/** The frame of the clip that shows a moment of the take (seconds). */
export function frameIn(cut: readonly Placed[], t: number) {
  for (const segment of cut) {
    if (t <= segment.to) {
      const into = Math.max(0, t - segment.from)
      return segment.start + Math.round((into / segment.rate) * FPS)
    }
  }
  return lengthOf(cut)
}

/** How long the receipt's total takes to tick to a new value, plus a beat to read it. */
const SETTLE = 1.0

/** S1: the whole first run at speed, landing on the settled total five seconds in. */
export function hookCut(take: Take) {
  const settled = markAt(take, 'run-done') + SETTLE
  const land = 5 * FPS
  const rate = 9.5
  const cut = place([{ from: settled - (rate * land) / FPS, to: settled, rate }])
  return { cut, land: lengthOf(cut), settled, leaks: leakFrames(take, cut) }
}

/**
 * S5: the click at real speed, the wait for the first leak at 4×, then the printing at 2×,
 * stopping when the total has settled.
 */
export function liveCut(take: Take) {
  const settled = markAt(take, 'run-done') + SETTLE
  const first = leaksOf(take)[0]?.t ?? 19
  const clickedAt = markAt(take, 'run-started')
  const cut = place([
    { from: clickedAt - 2.6, to: clickedAt + 1.4, rate: 1 },
    { from: clickedAt + 1.4, to: first - 0.6, rate: 4 },
    { from: first - 0.6, to: settled, rate: 2 },
  ])
  return { cut, end: lengthOf(cut), settled, leaks: leakFrames(take, cut) }
}

/** S8: the click on "Apply fixes", the re-run at 8×, the sealed receipt at real speed. */
export function fixCut(take: Take) {
  const started = markAt(take, 'rerun-started')
  const printed =
    linesOf(take).find((line) => line.t / 1000 > started)?.t ?? markOf(take, 'rerun-sealed')?.t ?? 0
  const sealedAt = printed / 1000
  const cut = place([
    { from: started - 1.6, to: started + 0.3, rate: 1 },
    { from: started + 0.3, to: sealedAt - 0.4, rate: 8 },
    { from: sealedAt - 0.4, to: sealedAt + 1.6, rate: 1 },
  ])
  return { cut, end: lengthOf(cut), sealed: frameIn(cut, sealedAt), settled: sealedAt + 1.6 }
}

/** The frames where a cut shows each leak printing. */
function leakFrames(take: Take, cut: readonly Placed[]) {
  return leaksOf(take).map((leak) => ({ ...leak, frame: frameIn(cut, leak.t) }))
}

/** Leak sounds at most three a second (VIDEO_PIPELINE §4.4): leaks closer than that share one. */
export function stings(frames: readonly number[], gap = Math.round(FPS / 3)) {
  const out: number[] = []
  for (const frame of [...frames].sort((a, b) => a - b)) {
    const last = out[out.length - 1]
    if (last === undefined || frame - last >= gap) out.push(frame)
  }
  return out
}

/**
 * The vertical teaser's beats, in frames: the receipt at speed, the total, the five cards, the
 * sealed re-run (landing about 2 s into its beat), and the end card. 40 s in all, so it loops.
 */
export function teaserCut(take: Take) {
  const hook = hookCut(take)
  const totalAt = hook.land
  const castAt = totalAt + 2 * FPS
  const card = Math.round(3.6 * FPS)
  const sealAt = castAt + 5 * card
  const endAt = sealAt + 8 * FPS
  const started = markAt(take, 'rerun-started')
  const printed = linesOf(take).find((line) => line.t / 1000 > started)?.t
  const sealedAt = (printed ?? markOf(take, 'rerun-sealed')?.t ?? 0) / 1000
  // The wait at 8×, then the lines printing and the stamp landing at real speed.
  const seal = place([
    { from: sealedAt - 12, to: sealedAt - 0.3, rate: 8 },
    { from: sealedAt - 0.3, to: sealedAt + 1.6, rate: 1 },
  ])
  return {
    hook,
    totalAt,
    castAt,
    card,
    sealAt,
    seal,
    sealedFrame: sealAt + frameIn(seal, sealedAt),
    sealSettled: sealedAt + 1.6,
    endAt,
    frames: endAt + 7 * FPS,
  }
}
