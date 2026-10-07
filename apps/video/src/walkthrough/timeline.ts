/**
 * The walkthrough's cuts: where each take plays, landed on the words that describe it, and the
 * frames the score and the overlays key from. Pure, so the scenes and scripts/compose.ts agree.
 */
import { FPS, framesOf, lines, phraseAt, sentenceAt } from '../script'
import { follow, frameIn, markAt, markOf, type Take } from '../timeline'
import { LEAKY, SEALED_RUN } from './cli'
import { W_SCENES, W_START, type WSceneId, wScene } from './script'

export const said = (id: WSceneId, sentence: number, phrase?: string) =>
  phrase === undefined ? sentenceAt(wScene(id), sentence) : phraseAt(wScene(id), sentence, phrase)

/** The frame a sentence finishes on. */
export function endOf(id: WSceneId, sentence: number) {
  const line = lines(wScene(id))[sentence]
  return line ? Math.round((line.start + line.seconds) * FPS) : 0
}

const clicks = (take: Take) => take.events.filter((e) => e.type === 'click').map((e) => e.t / 1000)

/** The shop: the shelf while the voice introduces it, ending on the field guide's button. */
export function introCut(store: Take) {
  const shelf = markAt(store, 'shelf')
  const add = clicks(store)[0] ?? 10.9
  return follow(
    [
      { t: shelf - 0.6, at: 0 },
      { t: shelf + 2.2, at: said('w-intro', 1) },
      { t: add - 1.6, at: said('w-intro', 2, 'sandbox') },
    ],
    framesOf(wScene('w-intro')),
    add - 0.3,
  )
}

/** A purchase: the guide into the cart, the checkout, PayPal's button; the steps as they're said. */
export function flowCut(store: Take) {
  const [add = 10.9, cart = 12.8] = clicks(store)
  const checkout = markAt(store, 'paypal') + 0.5
  const hover = markAt(store, 'hover')
  const cut = follow(
    [
      { t: add - 0.4, at: 0 },
      { t: cart, at: said('w-flow', 0, 'three') },
      { t: checkout, at: said('w-flow', 1) },
      { t: hover - 1.3, at: said('w-flow', 4) },
    ],
    framesOf(wScene('w-flow')),
    hover + 0.2,
  )
  return { cut, checkout: frameIn(cut, checkout) }
}

/** The double click: PayPal's button, still, under the drawing. */
export const doubleStill = (store: Take) => markAt(store, 'hover') + 0.4

/**
 * The echo, for real: the unpaid order while the voice explains the message, the status and the
 * shipments as it names them, the "paid" message sent as it finishes saying so, the reload on
 * "shipped".
 */
export function echoCut(echo: Take) {
  const unpaid = markAt(echo, 'unpaid')
  const sent = markAt(echo, 'answered')
  const shipped = markAt(echo, 'shipped')
  const moves = echo.events.filter((e) => e.type === 'move').map((e) => e.t / 1000)
  // The cursor's two stops on the unpaid page: the status, then "Nothing has shipped".
  const atStatus = moves.find((t) => t > unpaid) ?? unpaid + 1
  const atShipments = moves.find((t) => t > atStatus + 1.5) ?? unpaid + 3
  const enter = endOf('w-echo', 5) + Math.round(0.2 * FPS)
  const cut = follow(
    [
      { t: unpaid - 0.2, at: 0 },
      { t: unpaid, at: said('w-echo', 3) },
      { t: atStatus + 0.8, at: said('w-echo', 4, 'awaiting') },
      { t: atShipments + 0.8, at: said('w-echo', 4, 'nothing') },
      { t: sent, at: enter },
      { t: shipped, at: said('w-echo', 6, 'shipped') },
    ],
    framesOf(wScene('w-echo')),
    shipped + 6,
  )
  return {
    cut,
    enter,
    shipped: frameIn(cut, shipped),
    request: markOf(echo, 'send')?.data?.request ?? '{}',
    url: markOf(echo, 'send')?.data?.url ?? '',
    response: markOf(echo, 'answered')?.data?.response ?? '',
    order: markOf(echo, 'unpaid')?.data ?? {},
    paypal: markOf(echo, 'paypal')?.data ?? {},
  }
}

/** Shakedown's site: the problem line, the opening, then each customer as it is named. */
export function meetCut(site: Take) {
  const card = (name: string) => markAt(site, `card:${name}`) + 0.85
  return follow(
    [
      { t: markAt(site, 'problem') - 0.3, at: 0 },
      { t: markAt(site, 'problem') + 0.2, at: said('w-meet', 1) },
      { t: card('The Double-Clicker'), at: said('w-meet', 3) },
      { t: card('The Echo'), at: said('w-meet', 4) },
      { t: card('The Cart Shuffler'), at: said('w-meet', 5) },
      { t: card('The Bouncer'), at: said('w-meet', 6) },
      { t: card('The Policy Lawyer'), at: said('w-meet', 7) },
    ],
    framesOf(wScene('w-meet')),
    card('The Policy Lawyer') + 3,
  )
}

/** The command typed while the voice says it, then a customer's line every so often. */
export function cliTimes() {
  const typeFrom = said('w-cli', 1) + 4
  const enter = endOf('w-cli', 1) + 6
  const first = said('w-cli', 2) + 6
  const last = endOf('w-cli', 3) - 6
  const gap = (last - first) / Math.max(1, LEAKY.progress.length - 1)
  return {
    typeFrom,
    enter,
    header: enter + 10,
    progress: LEAKY.progress.map((_, i) => Math.round(first + i * gap)),
  }
}

/** The receipt printing as the CLI prints it, fourteen milliseconds a line, then the report. */
export function receiptTimes() {
  const start = 4
  const perLine = 0.014 * FPS
  return {
    start,
    line: (i: number) => Math.round(start + i * perLine),
    done: Math.round(start + LEAKY.receipt.length * perLine),
    report: said('w-receipt', 2) + 4,
  }
}

export function fixTimes() {
  const typeFrom = 8
  const enter = endOf('w-fix', 0) - 4
  const start = enter + 18
  const perLine = 0.014 * FPS
  return {
    typeFrom,
    enter,
    line: (i: number) => Math.round(start + i * perLine),
    done: Math.round(start + SEALED_RUN.receipt.length * perLine),
    ci: said('w-fix', 2) - 4,
  }
}

/** Every voiced span of the film, for ducking the score under the voice. */
export function wVoiceSpans() {
  return W_SCENES.flatMap((scene) =>
    lines(scene).map((line) => ({
      from: W_START[scene.id] + Math.round(line.start * FPS),
      to: W_START[scene.id] + Math.round((line.start + line.seconds) * FPS),
    })),
  )
}
