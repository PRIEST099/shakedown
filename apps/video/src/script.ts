/**
 * The hackathon video, scene by scene: how long each runs, what the voiceover says, and where the
 * pictures come from. LIVE is real footage of the running product, MG is motion graphics drawn
 * from the same components and the same recorded data. Every number comes from src/data/runs.json.
 *
 * The voiceover is written for a speaking pace of about 150 words a minute. Until it is recorded,
 * the animatic shows it as captions.
 */
import runs from './data/runs.json'
import vo from './data/vo.json'
import { numberWords } from './spoken'

export const FPS = 30

export const money = (cents: number) =>
  `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

export const TOTAL = money(-runs.checkout.totalCents)
export const MERCHANT = money(runs.checkout.merchantLeakCents)
export const CUSTOMER = money(runs.checkout.customerHarmCents)
export const POLICY_EXCESS = runs.exhibit.verdict.atRisk

/** The run's worst leak: the finding the console opens on, and the order the dashboard shot finds. */
const worst = Object.values(runs.checkout.findingsByPersona)
  .flat()
  .reduce<(typeof runs.checkout.findingsByPersona)['cart-shuffler'][number] | undefined>(
    (top, f) =>
      !top ||
      Number(f.merchantLeakCents) + Number(f.customerHarmCents) >
        Number(top.merchantLeakCents) + Number(top.customerHarmCents)
        ? f
        : top,
    undefined,
  )
const fact = (label: string) => worst?.evidence.find((e) => e.label === label)?.value ?? ''

/** A cart as the evidence quotes it, "2 × LL-PNR-PR", named and priced from the store's catalog. */
function cartOf(line: string) {
  const [, qty = '0', sku = ''] = /^(\d+) × (\S+)/.exec(line) ?? []
  const product = runs.store.catalog.find((item) => item.sku === sku)
  return {
    qty: Number(qty),
    name: product?.name ?? sku,
    cents: Number(qty) * (product?.priceCents ?? 0),
  }
}

/**
 * The worst leak, which the video follows from the receipt to PayPal's own dashboard: the Cart
 * Shuffler approved one cart, sent another at capture, and the store shipped the second.
 */
export const WORST = {
  order: fact('PayPal order'),
  /** "$18.00 (4G3057903W918205K)": the amount PayPal captured, and the capture's ID. */
  captured: fact('Captured at PayPal').split(' ')[0] ?? '',
  captureId: /\(([A-Z0-9]+)\)/.exec(fact('Captured at PayPal'))?.[1] ?? '',
  /** "$248.00 at the store's own prices": what the store shipped. */
  shipped: fact('Goods shipped').split(' ')[0] ?? '',
  /** What the store shipped beyond what PayPal captured. */
  leakCents: Number(worst?.merchantLeakCents ?? 0) + Number(worst?.customerHarmCents ?? 0),
  approved: cartOf(fact('Cart sent at checkout')),
  swapped: cartOf(fact('Cart sent at capture')),
}
export const LEAKS = runs.checkout.findings

export type Source = 'LIVE' | 'MG' | 'HYBRID'

export interface Scene {
  id: string
  title: string
  seconds: number
  source: Source
  vo: string
}

export const SCENES = [
  {
    id: 'hook',
    title: 'Cold open',
    seconds: 7,
    source: 'HYBRID',
    vo: 'Every happy-path test passes. Then the customers from hell show up.',
  },
  {
    id: 'problem',
    title: 'The problem',
    seconds: 15,
    source: 'MG',
    vo: 'Real customers double-click. They change the cart after approving it. Payment events arrive twice, late, or unsigned. And they argue with your AI support agent. Happy-path tests never meet them.',
  },
  {
    id: 'meet',
    title: 'Meet Shakedown',
    seconds: 12.5,
    source: 'HYBRID',
    vo: 'Shakedown is named for the shakedown cruise, a ship’s test voyage before passengers board. It sends customers from hell through your own PayPal checkout, in the sandbox.',
  },
  {
    id: 'cast',
    title: 'The cast',
    seconds: 18,
    source: 'MG',
    vo: 'The Double-Clicker presses Pay twice. The Cart Shuffler changes the cart after approval. The Echo replays payment events. The Bouncer pays with a card that bounces. And the Policy Lawyer talks your AI support agent past your refund policy.',
  },
  {
    id: 'store',
    title: 'The store under test: Leaky Llama',
    seconds: 10.5,
    source: 'LIVE',
    vo: 'Meet Leaky Llama, my demo store. It takes PayPal like any small shop, but I left the common integration mistakes in, on purpose.',
  },
  {
    id: 'live',
    title: 'A live run',
    seconds: 30,
    source: 'LIVE',
    vo: `Now the customers from hell go shopping. Each leak prints as PayPal’s sandbox confirms it. Charged twice and shipped twice. Goods shipped for more than PayPal captured. An unsigned “paid” event that released the goods. A declined card, and the order shipped anyway. ${LEAKS} leaks in all.`,
  },
  {
    id: 'proof',
    title: 'One leak, followed to PayPal’s own record',
    seconds: 23.5,
    source: 'HYBRID',
    vo: `Follow one of those leaks. The Cart Shuffler approved ${money(WORST.approved.cents)} of socks, then changed the cart to ${numberWords(WORST.swapped.qty)} pairs of panniers. PayPal captured ${WORST.captured}, the store shipped ${WORST.shipped} of goods, and ${money(WORST.leakCents)} leaked. And PayPal’s own dashboard shows that same capture: ${WORST.captured}.`,
  },
  {
    id: 'ai-vs-code',
    title: 'AI decides vs code decides',
    seconds: 17,
    source: 'LIVE',
    vo: `The AI plays the customers. Plain code keeps the score. Ask the support agent for a refund in two parts, and it says “All set.” The ledger says ${POLICY_EXCESS} went past the written policy.`,
  },
  {
    id: 'fix',
    title: 'The fix, the re-run, the CI gate',
    seconds: 21,
    source: 'LIVE',
    vo: 'Every finding comes with its fix. Apply the fixes, re-run with the same seed, and the receipt seals at zero. Put it in CI, and a leak can’t come back.',
  },
  {
    id: 'close',
    title: 'How it works, and the close',
    seconds: 18,
    source: 'MG',
    vo: 'Built on PayPal’s sandbox APIs, with Claude playing the customers and deterministic code keeping score. Shakedown: let the customers from hell find your leaks before your real customers do.',
  },
] as const satisfies readonly Scene[]

export type SceneId = (typeof SCENES)[number]['id']

/** Where each scene starts, in frames. */
export const START: Record<SceneId, number> = (() => {
  let at = 0
  const out = {} as Record<SceneId, number>
  for (const scene of SCENES) {
    out[scene.id] = at
    at += framesOf(scene)
  }
  return out
})()

/** A scene's length in frames (scene lengths may be half seconds). */
export function framesOf(scene: Scene) {
  return Math.round(scene.seconds * FPS)
}

export const DEMO_FRAMES = SCENES.reduce((sum, scene) => sum + framesOf(scene), 0)

export const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/** Words as spoken: an amount like $491.00 takes about three. */
const spokenWords = (text: string) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, word) => sum + (/\$\d/.test(word) ? 3 : 1), 0)

/** Seconds per spoken word at 150 words a minute, and the breath after a clause or a sentence. */
const PACE = 0.4
const BREATH = { clause: 0.12, sentence: 0.3 }
/** A cue is at most two lines of about 42 characters (VIDEO_PIPELINE §5.6). */
const CUE_MAX = 80
const LINE_MAX = 46

export interface Cue {
  from: number
  to: number
  text: string
  /** The cue as it is shown: one line, or two balanced ones. */
  lines: string[]
  /** The sentence of the voiceover the cue belongs to, from 0. */
  sentence: number
}

/** The voiceover's sentences, each keeping its full stop (and a closing quote after it). */
export const sentences = (vo: string) =>
  vo.split(/(?<=[.!?][”’"]?)\s+(?=[A-Z0-9“$])/).filter(Boolean)

const SMALL = /^(a|an|the|and|or|to|of|in|on|for|with|your|our|its|it|at|by|as|is)$/i

/**
 * The best place to break a piece of text in two: as even as possible, preferring a clause
 * boundary, and never leaving a small word hanging at the end of the first half.
 */
function halve(text: string): [string, string] {
  const parts = text.split(' ')
  let best: [string, string] = [text, '']
  let score = Number.POSITIVE_INFINITY
  for (let i = 1; i < parts.length; i += 1) {
    const a = parts.slice(0, i).join(' ')
    const b = parts.slice(i).join(' ')
    const last = parts[i - 1] ?? ''
    const cost =
      Math.max(a.length, b.length) +
      (/[,:;—]$/.test(last) ? 0 : 8) +
      (SMALL.test(last.replace(/[^A-Za-z]/g, '')) ? 12 : 0)
    if (cost < score) {
      score = cost
      best = [a, b]
    }
  }
  return best
}

/**
 * A sentence too long for one cue is split where it breathes: at its most even clause boundary
 * that leaves no fragment under 20 characters, or else as evenly as the words allow.
 */
function split(text: string, max: number): string[] {
  if (text.length <= max || !text.includes(' ')) return [text]
  const parts = text.split(' ')
  let best: [string, string] | undefined
  for (let i = 1; i < parts.length; i += 1) {
    if (!/[,:;—]$/.test(parts[i - 1] ?? '')) continue
    const a = parts.slice(0, i).join(' ')
    const b = parts.slice(i).join(' ')
    if (Math.min(a.length, b.length) < 20) continue
    if (!best || Math.max(a.length, b.length) < Math.max(best[0].length, best[1].length)) {
      best = [a, b]
    }
  }
  return (best ?? halve(text)).flatMap((half) => split(half, max))
}

export interface Timing {
  /** Seconds before the first word. */
  lead?: number
  /** Sentences held back until a moment in the scene (seconds), so words land with pictures. */
  anchors?: Partial<Record<number, number>>
}

/** A sentence of the voiceover, placed: where it starts in the scene and how long it runs. */
export interface Line {
  sentence: number
  text: string
  start: number
  seconds: number
  /** Timed from a recorded take (src/data/vo.json) rather than estimated from its words. */
  recorded: boolean
}

type Recorded = Record<string, { text: string; seconds: number }[] | undefined>

/** The recorded lines of a scene, if they are takes of the script's sentences as written now. */
function recorded(scene: Scene) {
  const takes = (vo.lines as Recorded)[scene.id]
  const said = sentences(scene.vo)
  if (!takes || takes.length !== said.length) return undefined
  return takes.every((take, i) => take.text === said[i]) ? takes : undefined
}

/**
 * Where each sentence of a scene's voiceover goes. Recorded lines run their real length;
 * otherwise the words are timed at about 150 a minute (and a scene whose words run long, with no
 * anchors, is spoken a little faster to fit). Each sentence follows the last after a breath, and
 * an anchor holds one back until its moment; it never makes words overlap.
 */
export function lines(scene: Scene, timing: Timing = {}): Line[] {
  const lead = timing.lead ?? 0.4
  const anchors = timing.anchors ?? {}
  const said = sentences(scene.vo)
  const takes = recorded(scene)
  const estimate = (text: string) =>
    spokenWords(text) * PACE + (split(text, CUE_MAX).length - 1) * BREATH.clause
  const natural = said.reduce((sum, text) => sum + estimate(text) + BREATH.sentence, 0)
  const room = scene.seconds - lead - 0.3
  const squeeze = !takes && Object.keys(anchors).length === 0 && natural > room ? room / natural : 1
  let at = lead
  return said.map((text, sentence) => {
    const pinned = anchors[sentence]
    if (pinned !== undefined) at = Math.max(at, pinned)
    const seconds = takes?.[sentence]?.seconds ?? estimate(text) * squeeze
    const line = { sentence, text, start: at, seconds, recorded: Boolean(takes) }
    at += seconds + BREATH.sentence * squeeze
    return line
  })
}

/**
 * The voiceover as caption cues: each sentence's time shared among its cues by their words. A
 * cue stays up a little past its last word and comes down before the next one.
 */
export function cues(scene: Scene, timing: Timing = {}): Cue[] {
  const timed = lines(scene, timing).flatMap((line) => {
    const pieces = split(line.text, CUE_MAX)
    const total = pieces.reduce((sum, piece) => sum + spokenWords(piece), 0)
    let at = line.start
    return pieces.map((text) => {
      const length = (spokenWords(text) / total) * line.seconds
      const cue = { text, sentence: line.sentence, start: at, length }
      at += length
      return cue
    })
  })
  return timed.map((cue, i) => {
    const next = timed[i + 1]?.start ?? scene.seconds - 0.2
    const until = Math.min(cue.start + cue.length + 0.5, next - 0.07, scene.seconds - 0.2)
    return {
      from: Math.round(cue.start * FPS),
      to: Math.round(until * FPS),
      text: cue.text,
      lines: cue.text.length <= LINE_MAX ? [cue.text] : halve(cue.text),
      sentence: cue.sentence,
    }
  })
}

/** The frame where a sentence of a scene's voiceover starts. */
export const sentenceAt = (scene: Scene, sentence: number, timing?: Timing) =>
  Math.round((lines(scene, timing)[sentence]?.start ?? 0) * FPS)

/**
 * The frame where a phrase of a sentence is said, its line's time shared out by spoken words as
 * the cues share it: close enough to land a highlight with the word.
 */
export function phraseAt(scene: Scene, sentence: number, phrase: string, timing?: Timing) {
  const line = lines(scene, timing)[sentence]
  if (!line) return 0
  const at = line.text.indexOf(phrase)
  const before = at <= 0 ? 0 : spokenWords(line.text.slice(0, at))
  return Math.round((line.start + (before / spokenWords(line.text)) * line.seconds) * FPS)
}

/** How long a scene's words take at the natural pace, for checking the script against the cut. */
export const spokenSeconds = (scene: Scene) =>
  sentences(scene.vo).reduce(
    (sum, sentence) => sum + spokenWords(sentence) * PACE + BREATH.sentence,
    0,
  )
