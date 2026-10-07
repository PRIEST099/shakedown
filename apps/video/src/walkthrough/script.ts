/**
 * The walkthrough: a second cut of the hackathon video, told the way a person shows a colleague
 * their screen. It starts from nothing: the problem first, on Leaky Llama, with one leak shown
 * happening for real; then Shakedown; then how it is used, from the terminal. Every fact is in the
 * words, so it can be followed by ear alone, and the pace leaves room to breathe.
 *
 * The scene lengths are set from the recorded takes (src/data/vo-walkthrough.json), with each
 * scene's pauses where a speaker would stop: run `pnpm voice --film=walkthrough` after any edit.
 */
import runs from '../data/runs.json'
import { FPS, framesOf, type Scene, usd } from '../script'
import { numberWords } from '../spoken'

const checkout = runs.checkout

/** The echo shown for real: an order for the bottle, sent a "paid" message by hand. */
export const ECHO_ITEM = { sku: 'LL-BTL-750', name: 'Insulated bottle, 750 ml', cents: 3600 }

export const W_SCENES = [
  {
    id: 'w-intro',
    title: 'The shop',
    seconds: 17.3,
    source: 'LIVE',
    vo: 'Let me show you a problem that hides in a lot of PayPal checkouts. This is Leaky Llama, a little online shop I built for this demo. It takes payment with PayPal, and it runs in PayPal’s sandbox, so every dollar you’ll see is pretend.',
    pauses: { 1: 0.3, 2: 0.2 },
  },
  {
    id: 'w-flow',
    title: 'What happens when someone buys',
    seconds: 16.3,
    source: 'HYBRID',
    vo: 'When someone buys, three things happen. The customer approves the payment. PayPal collects the money. And then my shop’s own code decides what to ship. That’s where money leaks: in my shop’s own code, where PayPal can’t see it.',
    pauses: { 1: 0.2, 2: 0.15, 3: 0.15, 4: 0.3 },
  },
  {
    id: 'w-double',
    title: 'Leak one: the double click',
    seconds: 17.3,
    source: 'MG',
    vo: `Here’s the first leak. A customer presses Pay, the page is slow, so they press it again. My shop opens a second order, and the customer is charged for both: ${usd(2400)}, twice. To PayPal, those are two good payments.`,
    pauses: { 1: 0.3, 2: 0.3, 3: 0.3 },
  },
  {
    id: 'w-echo',
    title: 'Leak two: the echo, for real',
    seconds: 31,
    source: 'LIVE',
    vo: `The second one is sneakier. After a payment, PayPal tells the shop the order is paid, in a message signed to prove it came from PayPal. My shop never checks the signature. Watch: here’s an order for a ${usd(ECHO_ITEM.cents)} water bottle. It says awaiting payment, and nothing has shipped. I’ll send my shop that message myself, with no signature at all. And there it goes: shipped. PayPal never collected a cent.`,
    pauses: { 1: 0.2, 2: 0.15, 3: 0.5, 4: 0.15, 5: 0.4, 6: 0.6, 7: 0.35 },
  },
  {
    id: 'w-meet',
    title: 'So I built Shakedown',
    seconds: 29.9,
    source: 'LIVE',
    vo: 'A normal test won’t catch leaks like these, because test customers behave. So I built Shakedown. It sends customers from hell at your checkout, in PayPal’s sandbox. One double-clicks. One fakes that message from PayPal. One swaps their cart halfway through paying. One pays with a card that gets declined. A fifth asks your AI support assistant for refunds, to check it keeps to your policy.',
    pauses: { 1: 0.35, 2: 0.2, 3: 0.3, 4: 0.1, 5: 0.1, 6: 0.1, 7: 0.3 },
  },
  {
    id: 'w-cli',
    title: 'One command',
    seconds: 19.5,
    source: 'HYBRID',
    vo: 'Shakedown is an npm package. In a terminal, I run one command, pointed at my shop. The customers go in, one at a time. After each one, it checks what my shop did against what really happened, using PayPal’s records wherever money moved.',
    pauses: { 1: 0.2, 2: 0.8, 3: 0.3 },
  },
  {
    id: 'w-receipt',
    title: 'The receipt',
    seconds: 17.1,
    source: 'HYBRID',
    vo: `It finds ${numberWords(checkout.findings)} leaks. My shop would lose ${usd(checkout.merchantLeakCents)}, and a customer paid ${usd(checkout.customerHarmCents)} too much. It also writes a report, with the evidence for every leak, and the fix.`,
    // The receipt prints first (about two seconds at the CLI's own pace), then the voice reads it.
    pauses: { 0: 2.0, 1: 0.3, 2: 0.4 },
  },
  {
    id: 'w-fix',
    title: 'Fix it, and keep it fixed',
    seconds: 18.1,
    source: 'HYBRID',
    vo: 'So I fix my code, and run the same command on the fixed shop. Nothing leaks, and where Shakedown can’t be sure, it says so. Then I run it on every pull request: if a leak ever comes back, the check fails, before a real customer finds it.',
    pauses: { 1: 0.6, 2: 0.4 },
  },
  {
    id: 'w-close',
    title: 'Close',
    seconds: 9.4,
    source: 'MG',
    vo: 'That’s Shakedown. Let customers from hell find your leaks, before your real customers do.',
    pauses: { 1: 0.3 },
  },
] as const satisfies readonly Scene[]

export type WSceneId = (typeof W_SCENES)[number]['id']

export const W_START: Record<WSceneId, number> = (() => {
  let at = 0
  const out = {} as Record<WSceneId, number>
  for (const scene of W_SCENES) {
    out[scene.id] = at
    at += framesOf(scene)
  }
  return out
})()

export const W_FRAMES = W_SCENES.reduce((sum, scene) => sum + framesOf(scene), 0)

export const wScene = (id: WSceneId): Scene => W_SCENES.find((scene) => scene.id === id) as Scene

export { FPS }
