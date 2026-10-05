import type { PersonaId } from '@shakedown/core/cast'

/** A region of a screenshot, in the CSS pixels it was taken at (1440 wide). */
export type Crop = { x: number; y: number; width: number; height: number }

export type Slide = {
  name: string
  headline: string
  caption: string
} & ({ shot: string; url: string; crop: Crop } | { cast: true })

/** The Devpost gallery, in the order it's uploaded: one frame per slide, written for newcomers. */
export const SLIDES: Slide[] = [
  {
    name: 'what-it-is',
    headline: 'What is Shakedown?',
    caption:
      'Test customers who try to break your PayPal checkout before real ones do. It runs in PayPal’s sandbox, where the money is fake.',
    shot: 'hero',
    url: 'shakedown-web.onrender.com',
    crop: { x: 100, y: 64, width: 1240, height: 690 },
  },
  {
    name: 'the-cast',
    headline: 'Meet the customers from hell',
    caption:
      'Each one does something real customers do. Afterwards, Shakedown reads PayPal’s own records to see whether your shop got it right.',
    cast: true,
  },
  {
    name: 'how-it-works',
    headline: 'How a run works',
    caption:
      'Connect your sandbox shop, send in the cast, read the receipt. Then fix the code and run it again.',
    shot: 'how',
    url: 'shakedown-web.onrender.com/#how',
    crop: { x: 120, y: 120, width: 1200, height: 450 },
  },
  {
    name: 'every-leak',
    headline: 'Every leak, to the cent',
    caption:
      'A live run against Leaky Llama, the deliberately leaky demo shop I built: 8 leaks, $491.00. Each line names the PayPal record that proves it.',
    shot: 'run',
    url: 'shakedown-web.onrender.com/#demo',
    crop: { x: 120, y: 28, width: 1200, height: 530 },
  },
  {
    name: 'fixed',
    headline: 'Fix it, run it again: $0.00',
    caption:
      'The same customers come back after the fixes. Where only PayPal could sign the test message, it says “inconclusive” instead of guessing.',
    shot: 'sealed',
    url: 'shakedown-web.onrender.com/#demo',
    crop: { x: 120, y: 28, width: 1200, height: 560 },
  },
  {
    name: 'ai-and-code',
    headline: 'The AI talks. PayPal’s records decide.',
    caption:
      'The shop’s AI support bot said “All set”. PayPal’s records show its second refund, $34.00, broke the shop’s own refund limit.',
    shot: 'decides',
    url: 'shakedown-web.onrender.com/#how-it-decides',
    crop: { x: 120, y: 285, width: 1200, height: 490 },
  },
  {
    name: 'console',
    headline: 'The console, built on AG Studio',
    caption:
      'Every run in one place: the scoreboard, where the money would have gone, and the worst finding with its proof and its fix. Expand opens any of them large.',
    shot: 'console',
    url: 'shakedown-web.onrender.com/app',
    crop: { x: 0, y: 64, width: 1440, height: 696 },
  },
  {
    name: 'terminal',
    headline: 'The same receipt in your terminal',
    caption:
      'One command runs the cast against your own shop. It fails, with exit code 1, whenever money would leak.',
    shot: 'cli',
    url: 'shakedown-web.onrender.com/#cli',
    crop: { x: 120, y: 95, width: 1200, height: 525 },
  },
  {
    name: 'pull-request',
    headline: 'And on every pull request',
    caption:
      'In GitHub Actions, the receipt is posted on the pull request, so a leak can’t slip back in unnoticed.',
    shot: 'ci',
    url: 'shakedown-web.onrender.com/#cli',
    crop: { x: 120, y: 50, width: 1200, height: 410 },
  },
]

/** The cast slide: what each one does, and what Shakedown checks afterwards. */
export const CAST: { id: PersonaId; does: string; checks: string }[] = [
  { id: 'double-clicker', does: 'Presses Pay twice', checks: 'charged once, shipped once' },
  {
    id: 'cart-shuffler',
    does: 'Changes the cart after paying',
    checks: 'never ships more than was paid',
  },
  {
    id: 'echo',
    does: 'Sends “paid” messages PayPal never sent',
    checks: 'trusts only real PayPal messages',
  },
  { id: 'bouncer', does: 'Pays with a declined card', checks: 'nothing ships unpaid' },
  {
    id: 'policy-lawyer',
    does: 'Argues with your support bot for refunds',
    checks: 'refunds stay within your policy',
  },
]
