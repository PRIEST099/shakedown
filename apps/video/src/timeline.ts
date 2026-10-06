/**
 * Where things happen in the cut, worked out from a take's event log: the speed-ramped segments
 * of each piece of footage, and the frames where its leaks print and its receipt seals. The
 * scenes draw from these and scripts/compose.ts scores from them, so picture and sound agree.
 * Plain TypeScript: no React, no Remotion.
 */
import { FPS, framesOf, lines, phraseAt, SCENES, type SceneId, START, sentenceAt } from './script'

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

export type TakeName = 'landing' | 'store' | 'live-run' | 'console' | 'exhibit' | 'ci' | 'dashboard'

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
  /** How fast the take plays; 0 holds it still on `from`. */
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

/** The first frame of the clip that shows a moment of the take (seconds). */
export function frameIn(cut: readonly Placed[], t: number) {
  for (const segment of cut) {
    if (segment.rate === 0) {
      if (t <= segment.from) return segment.start
      continue
    }
    if (t <= segment.to) {
      const into = Math.max(0, t - segment.from)
      return segment.start + Math.round((into / segment.rate) * FPS)
    }
  }
  return lengthOf(cut)
}

/** A moment of the take (seconds) and the frame of the scene it should land on. */
export interface Key {
  t: number
  at: number
}

/**
 * A cut that lands each moment of the take on its frame of the scene, so the picture follows the
 * voice, whoever reads it. Where the take has more to show than the voice has time for, it plays
 * faster; where it has less, it holds still, then plays at real speed into the moment. After the
 * last key it plays on at real speed to `until` (seconds into the take), then holds to `end`.
 */
export function follow(keys: readonly Key[], end: number, until?: number): Placed[] {
  const out: Placed[] = []
  const push = (from: number, to: number, rate: number, frames: number) => {
    if (frames > 0) out.push({ from, to, rate, start: lengthOf(out), frames })
  }
  for (const [i, b] of keys.entries()) {
    const a = keys[i - 1]
    if (!a) continue
    const frames = b.at - a.at
    const need = (b.t - a.t) * FPS
    if (frames <= 0) continue
    if (need <= 0) push(a.t, a.t, 0, frames)
    else if (need >= frames) {
      // The opening, or a sliver over real speed, starts later in the take instead of being
      // labelled a speed-up.
      const trim = (need - frames) / FPS
      if (i === 1 || trim <= 0.3) push(b.t - frames / FPS, b.t, 1, frames)
      else push(a.t, b.t, need / frames, frames)
    } else {
      // Run on half a second past the moment, so the still shows what it just did, then hold,
      // then play at real speed into the next moment.
      const played = Math.round(need)
      const runIn = Math.min(Math.round(FPS / 2), Math.floor(played / 2))
      const held = a.t + runIn / FPS
      push(a.t, held, 1, runIn)
      push(held, held, 0, frames - played)
      push(held, b.t, 1, played - runIn)
    }
  }
  const last = keys.at(-1)
  if (last) {
    const left = end - lengthOf(out)
    const run = Math.min(left, Math.round(Math.max(0, (until ?? last.t) - last.t) * FPS))
    push(last.t, last.t + run / FPS, 1, run)
    push(last.t + run / FPS, last.t + run / FPS, 0, left - run)
  }
  return out
}

/** How long the receipt's total takes to tick to a new value, plus a beat to read it. */
const SETTLE = 1.0

const sceneOf = (id: SceneId) => SCENES.find((scene) => scene.id === id) ?? SCENES[0]
const clicksOf = (take: Take) =>
  take.events.filter((e) => e.type === 'click').map((e) => e.t / 1000)

/**
 * The cold open: the whole first run at speed, landing on the settled total. The film lands it as
 * the voice says the total, with the first leak printing a second in; the teaser lands it at 5 s.
 */
export function hookCut(take: Take, film = false) {
  const settled = markAt(take, 'run-done') + SETTLE
  const hook = sceneOf('hook')
  const land = film ? phraseAt(hook, 1, '$') : 5 * FPS
  const first = leaksOf(take)[0]?.t ?? settled - 30
  const rate = film ? (settled - first) / (land / FPS - 1) : 9.5
  const cut = place([{ from: settled - (rate * land) / FPS, to: settled, rate }])
  return { cut, land: lengthOf(cut), settled, leaks: leakFrames(take, cut) }
}

/**
 * The store: the shelf, the click into the cart, the checkout with PayPal's button while the voice
 * explains a payment, then the leak switches opening as it says what a skipped check costs.
 */
export function storeCut(take: Take) {
  const store = sceneOf('store')
  const clicks = clicksOf(take)
  // The first click puts socks in the cart; the last opens the leak switches.
  const added = clicks[0] ?? 10
  const opened = clicks.at(-1) ?? 18
  // The checkout once PayPal's button has drawn itself.
  const checkout = markAt(take, 'paypal') + 0.8
  const cut = follow(
    [
      { t: markAt(take, 'shelf') + 0.6, at: 0 },
      { t: added, at: sentenceAt(store, 1) - 6 },
      { t: checkout, at: sentenceAt(store, 1) + FPS },
      { t: opened, at: sentenceAt(store, 3) },
    ],
    framesOf(store),
    take.durationMs / 1000 - 0.1,
  )
  return { cut, checkout: frameIn(cut, checkout), switches: frameIn(cut, opened) }
}

/**
 * The live run: the click on "Unleash the cast", then each leak printing as the voice names it, and
 * the total settling as it says the total.
 */
export function liveCut(take: Take) {
  const live = sceneOf('live')
  const said = (sentence: number, phrase: string) => phraseAt(live, sentence, phrase)
  const settled = markAt(take, 'run-done') + SETTLE
  const clicked = markAt(take, 'run-started')
  const leaks = leaksOf(take)
  const at = (i: number, sentence: number, phrase: string) =>
    leaks[i] ? [{ t: leaks[i].t, at: said(sentence, phrase) }] : []
  const cut = follow(
    [
      { t: clicked - 1.2, at: 0 },
      { t: clicked, at: said(0, 'Unleash') },
      ...at(0, 1, 'pays'),
      ...at(1, 2, 'twice'),
      ...at(2, 3, 'picks'),
      ...at(3, 3, 'swaps'),
      ...at(4, 5, 'believes'),
      ...at(7, 6, 'ships'),
      { t: settled, at: said(7, '$') },
    ],
    framesOf(live),
    settled + 0.5,
  )
  return {
    cut,
    end: lengthOf(cut),
    settled,
    split: said(0, 'Unleash') + 12,
    leaks: leakFrames(take, cut),
  }
}

/**
 * The fix: the leaky receipt while the voice names a fix, the click on "Apply fixes and re-run" on
 * "switch", the re-run at speed, the receipt sealing on "$0", then on to the CI shot.
 */
export function fixCut(take: Take) {
  const fix = sceneOf('fix')
  const leaky = markAt(take, 'run-done') + SETTLE
  const started = markAt(take, 'rerun-started')
  const clicked = clicksOf(take).find((t) => t > leaky) ?? started
  const printed =
    linesOf(take).find((line) => line.t / 1000 > started)?.t ?? markOf(take, 'rerun-sealed')?.t ?? 0
  const sealedAt = printed / 1000
  const ciAt = sentenceAt(fix, 4) - 3
  const cut = follow(
    [
      { t: leaky, at: 0 },
      { t: clicked, at: phraseAt(fix, 1, 'switch') },
      { t: sealedAt, at: phraseAt(fix, 2, '$') },
    ],
    ciAt,
    sealedAt + 1.6,
  )
  return { cut, end: ciAt, sealed: frameIn(cut, sealedAt), settled: sealedAt + 1.6 }
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

// ---------- the voiceover's place in the cut ----------

/**
 * The proof scene cuts from the console to PayPal's dashboard just after the voice has said what
 * went out unpaid; the close's end card comes in as the voice starts the tagline.
 */
export const PROOF_DASHBOARD = (() => {
  const unpaid = lines(sceneOf('proof'))[4]
  return Math.round(((unpaid?.start ?? 0) + (unpaid?.seconds ?? 0) + 0.3) * FPS)
})()
export const CLOSE_CARD = sentenceAt(sceneOf('close'), 3) - 5

/** Every recorded voiceover line in the film, as frames, for ducking the score under them. */
export function voiceSpans() {
  return SCENES.flatMap((scene) =>
    lines(scene)
      .filter((line) => line.recorded)
      .map((line) => ({
        from: START[scene.id] + Math.round(line.start * FPS),
        to: START[scene.id] + Math.round((line.start + line.seconds) * FPS),
      })),
  )
}
