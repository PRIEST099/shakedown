/**
 * The hackathon video, scene by scene: how long each runs, what the voiceover says, and where the
 * pictures come from. LIVE is real footage of the running product, MG is motion graphics drawn
 * from the same components and the same recorded data. Every number comes from src/data/runs.json.
 *
 * The voiceover is written to be followed by ear alone (a listener who cannot see the screen gets
 * every fact), at about 145 words a minute. Until it is recorded, the animatic shows it as captions.
 */
import runs from './data/runs.json'
import vo from './data/vo.json'
import voWalkthrough from './data/vo-walkthrough.json'
import { numberWords } from './spoken'

export const FPS = 30

export const money = (cents: number) =>
  `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

export const TOTAL = money(-runs.checkout.totalCents)
export const MERCHANT = money(runs.checkout.merchantLeakCents)
export const CUSTOMER = money(runs.checkout.customerHarmCents)
export const POLICY_EXCESS = runs.exhibit.verdict.atRisk

/** An amount the way the voice says it: "$491", "$18" (cents only when there are some). */
export const usd = (cents: number) =>
  `$${(Math.abs(cents) / 100).toFixed(Math.abs(cents) % 100 === 0 ? 0 : 2)}`
const cents = (amount: string) => Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100)
const persona = (id: string) => runs.hero.before.find((line) => line.personaId === id)
const findings = runs.checkout.findingsByPersona

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

/** The Cart Shuffler's other leak: a price it set itself, $1 for $124 saddlebags. */
const ownPrice = findings['cart-shuffler'].find((f) => f !== worst)
const ownFact = (label: string) => ownPrice?.evidence.find((e) => e.label === label)?.value ?? ''
export const OWN_PRICE = {
  leakCents: Number(ownPrice?.merchantLeakCents ?? 0),
  paid: usd(cents(ownFact('Captured at PayPal').split(' ')[0] ?? '')),
  shipped: usd(cents(ownFact('Goods shipped').split(' ')[0] ?? '')),
}

/** What each customer's line came to, as the receipt printed it. */
export const LINE = {
  doubleCharge: usd(findings['double-clicker'][0]?.customerHarmCents ?? 0),
  doubleShip: usd(findings['double-clicker'][1]?.merchantLeakCents ?? 0),
  cartShuffler: usd(persona('cart-shuffler')?.amountCents ?? 0),
  echo: usd(persona('echo')?.amountCents ?? 0),
  echoCount: findings.echo.length,
  bouncer: usd(persona('bouncer')?.amountCents ?? 0),
}

/** The Policy Lawyer's recorded run: what it asked for, the limit, and what went past it. */
export const POLICY = {
  asked: usd(runs.exhibit.ledger.reduce((sum, line) => sum + cents(line.amount), 0)),
  limit: usd(cents(/\$[0-9,.]+/.exec(runs.exhibit.verdict.why)?.[0] ?? '')),
  excess: usd(cents(POLICY_EXCESS)),
}

/** After the fixes, the same test again. */
export const SEALED = usd(runs.hero.after.reduce((sum, line) => sum + line.amountCents, 0))
export const EVAL = runs.evaluation

export type Source = 'LIVE' | 'MG' | 'HYBRID'

export interface Scene {
  id: string
  title: string
  seconds: number
  source: Source
  vo: string
  /** Extra seconds of silence before a sentence, where a speaker would stop and let it land. */
  pauses?: Partial<Record<number, number>>
}

export const SCENES = [
  {
    id: 'hook',
    title: 'Cold open: the sound of a leak',
    seconds: 13.6,
    source: 'HYBRID',
    vo: `Each chime you hear is a leak: money a bug would cost. One sandbox test run: ${numberWords(LEAKS)} leaks, ${usd(runs.checkout.totalCents)}. Shakedown finds them first, for developers with PayPal checkouts.`,
  },
  {
    id: 'store',
    title: 'How a PayPal payment works, in my shop',
    seconds: 18.4,
    source: 'HYBRID',
    vo: 'My demo shop, Leaky Llama, has bugs on purpose. A customer approves a payment, PayPal collects, and my shop ships. PayPal also sends a “paid” message, signed to prove it’s real. Skip one check: goods ship unpaid, or someone pays twice.',
  },
  {
    id: 'meet',
    title: 'Sandbox, scripts, and the five customers',
    seconds: 14.1,
    source: 'HYBRID',
    vo: 'Shakedown runs in PayPal’s sandbox: pretend money, nothing really ships. Its five customers from hell are fixed scripts, not AI. Four test my checkout; one tests my shop’s AI assistant, Lulu.',
  },
  {
    id: 'live',
    title: 'A live run, customer by customer',
    seconds: 37.2,
    source: 'LIVE',
    vo: `I click “Unleash the cast”. The Double-Clicker presses Pay twice, and pays ${LINE.doubleCharge} twice. On another order, a retry ships it twice: another ${LINE.doubleShip}. The Cart Shuffler picks its own price, and later swaps a cart: two leaks, ${LINE.cartShuffler}. The Echo sends unsigned “paid” messages ${numberWords(LINE.echoCount)} ways: once, twice, and late. My shop believes all ${numberWords(LINE.echoCount)}: ${LINE.echo}. The Bouncer’s card is declined, but its order ships: ${LINE.bouncer}. ${numberWords(LEAKS).replace(/^./, (c) => c.toUpperCase())} leaks in all: ${usd(runs.checkout.totalCents)}.`,
  },
  {
    id: 'proof',
    title: 'One leak, followed to PayPal’s own record',
    seconds: 25,
    source: 'HYBRID',
    vo: `The Cart Shuffler approved ${usd(WORST.approved.cents)} for socks. Then it swapped in ${numberWords(WORST.swapped.qty)} pairs of saddlebags. PayPal collected ${usd(cents(WORST.captured))}. My shop shipped ${usd(cents(WORST.shipped))}. ${usd(WORST.leakCents)} went out unpaid. PayPal’s sandbox dashboard agrees: ${usd(cents(WORST.captured))}, for socks. Its other leak: saddlebags worth ${OWN_PRICE.shipped}, paid ${OWN_PRICE.paid}.`,
  },
  {
    id: 'ai-vs-code',
    title: 'What the AI said vs what the money did',
    seconds: 21.3,
    source: 'LIVE',
    vo: `My policy: over ${POLICY.limit} an order, a person decides. In one recorded run, the Policy Lawyer asked Lulu for ${POLICY.asked}, in two parts. Lulu refunded both: “All set.” Plain code read PayPal’s refunds: the second, ${POLICY.excess}, should have gone to a person.`,
  },
  {
    id: 'fix',
    title: 'Fix, the same test again, and keep it fixed',
    seconds: 23.5,
    source: 'LIVE',
    vo: `Each leak gets a fix, like shipping only what PayPal collected. I switch on my fixes. Same checkout test again: ${SEALED}. Two Echo checks stay inconclusive: only PayPal can sign those messages. Shakedown runs from one command, or on every pull request. A leak that comes back fails the check.`,
  },
  {
    id: 'close',
    title: 'Proof it works, how it decides, and the promise',
    seconds: 20.9,
    source: 'MG',
    vo: `I tested the tester: every checkout bug I switched on was caught, with no false alarms. Claude runs Lulu, reads my policy, and explains; plain code decides. I also sent PayPal’s Agent Toolkit a fix for retried calls. Shakedown: let customers from hell find your leaks first.`,
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

/** Every film's takes, by scene id (the walkthrough's scene ids all start with "w-"). */
const TAKES: Recorded = { ...(vo.lines as Recorded), ...(voWalkthrough.lines as Recorded) }

/** The recorded lines of a scene, if they are takes of the script's sentences as written now. */
function recorded(scene: Scene) {
  const takes = TAKES[scene.id]
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
    at += scene.pauses?.[sentence] ?? 0
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
