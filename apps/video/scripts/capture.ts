/**
 * Real footage for the video (the LIVE layer): Playwright drives the running site and console
 * in Chrome while `page.screencast` saves each repainted frame as a JPEG. Every frame and every
 * cursor move or click is stamped on the same clock, so Remotion can draw the cursor, the zooms
 * and the callouts afterwards, and `conform.ts` can turn the frames into 30 fps video.
 *
 *   SITE_URL=http://localhost:3200 STORE_URL=http://localhost:3100 \
 *     pnpm --filter @shakedown/video capture [take …] [--scale=2]
 *
 * The site must be running a production build, with the demo store behind it. Live runs go to
 * Leaky Llama in the PayPal sandbox: they cost sandbox calls only. Nothing here types a password,
 * and nothing is captured from any page but Shakedown's own and its demo store's, except the
 * signed-in takes below. The store take puts socks in a cart and stops at the PayPal button: it
 * never pays.
 *
 * Signed-in takes (the PayPal sandbox dashboard) run in a Chrome window you signed in to yourself,
 * opened with a throwaway profile and a local debugging port; the script connects to it:
 *
 *   pnpm --filter @shakedown/video capture dashboard --cdp=http://127.0.0.1:9223
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type Browser, chromium, type Locator, type Page } from '@playwright/test'
import { CAST } from '@shakedown/core/cast'
import { WORST } from '../src/script'

const SITE = process.env.SITE_URL?.trim() || 'http://localhost:3200'
/** Leaky Llama, the demo store the site's live runs go to. */
const STORE = process.env.STORE_URL?.trim() || 'http://localhost:3100'
const SCALE = Number(process.argv.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 1)
/** A Chrome you signed in to, for the signed-in takes. */
const CDP = process.argv.find((a) => a.startsWith('--cdp='))?.slice('--cdp='.length)
const WIDTH = 1920
const HEIGHT = 1080
const RAW = path.resolve(import.meta.dirname, '../public/footage/raw')

type Event =
  | { t: number; type: 'move'; x: number; y: number }
  | { t: number; type: 'click'; x: number; y: number }
  | {
      t: number
      type: 'mark'
      label: string
      box?: Box
      /** What was on screen at the mark, e.g. a receipt line's persona, amount and evidence. */
      data?: Record<string, string>
    }

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A receipt line as the page printed it. */
interface PrintedLine {
  name: string
  amount: string
  evidence: string
  verdict: string
  box: Box
}

interface Take {
  name: string
  /** What the take shows, for the asset ledger and anyone reading the footage folder. */
  shows: string
  /** Runs only with --cdp, in a window you signed in to (the PayPal sandbox). */
  signedIn?: boolean
  run(shot: Shot): Promise<void>
}

/**
 * Runs in the page: reports each receipt line when it prints, and again whenever its amount or
 * evidence changes, through the `__shakedownLine` binding.
 */
const RECEIPT_WATCHER = `(() => {
  const seen = new Map()
  const scan = () => {
    const present = new Set()
    for (const li of document.querySelectorAll('.demo__tape .sd-tape__line')) {
      // The name cell holds a screen-reader prefix, then the persona's short name.
      const name = li.querySelector('.sd-tape__name')?.lastChild?.textContent?.trim() ?? ''
      const amount = li.querySelector('.sd-tape__amount')?.textContent?.trim() ?? ''
      const evidence = li.querySelector('.sd-tape__evidence')?.textContent?.trim() ?? ''
      present.add(name)
      const key = amount + '|' + evidence
      if (seen.get(name) === key) continue
      seen.set(name, key)
      const r = li.getBoundingClientRect()
      const verdict = (li.className.match(/\\bis-(\\w+)/) ?? [])[1] ?? ''
      window.__shakedownLine({ name, amount, evidence, verdict, box: { x: r.x, y: r.y, width: r.width, height: r.height } })
    }
    // A cleared receipt (the re-run) starts its lines afresh.
    for (const name of [...seen.keys()]) if (!present.has(name)) seen.delete(name)
  }
  const tape = document.querySelector('.demo__tape')
  if (tape) new MutationObserver(scan).observe(tape, { subtree: true, childList: true, characterData: true })
})()`

/** True once PayPal's button has drawn itself on the store's checkout page. */
const PAYPAL_BUTTON_DRAWN = `(() => {
  const button = document.querySelector('section[aria-labelledby="pay-heading"] paypal-button')
  return (button?.getBoundingClientRect().height ?? 0) > 30
})()`

/** One take: the page, its clock, and the event log the edit reads. */
class Shot {
  readonly events: Event[] = []
  readonly started = performance.now()
  private cursor = { x: WIDTH / 2, y: HEIGHT / 2 }

  constructor(readonly page: Page) {}

  now() {
    return performance.now() - this.started
  }

  async mark(label: string, target?: Locator) {
    const box = target ? ((await target.boundingBox()) ?? undefined) : undefined
    this.events.push({ t: this.now(), type: 'mark', label, box })
  }

  /**
   * Marks every line the demo receipt prints, and every time a line's amount changes, on the
   * take's clock: the edit times its callouts and its LEAK sounds from these.
   */
  async watchReceipt() {
    const byName = new Map(CAST.map((persona) => [persona.shortName, persona.id]))
    await this.page.exposeFunction('__shakedownLine', (line: PrintedLine) => {
      this.events.push({
        t: this.now(),
        type: 'mark',
        label: 'line',
        box: line.box,
        data: {
          persona: byName.get(line.name) ?? line.name,
          amount: line.amount,
          evidence: line.evidence,
          verdict: line.verdict,
        },
      })
    })
    // Plain JavaScript, so the page gets it exactly as written (no transpiler helpers).
    await this.page.evaluate(RECEIPT_WATCHER)
  }

  /** Glide the cursor to an element's centre, the way a person would, logging the path. */
  async moveTo(target: Locator, ms = 700) {
    await target.scrollIntoViewIfNeeded()
    const box = await target.boundingBox()
    if (!box) throw new Error('Nothing to move to.')
    const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const steps = Math.max(8, Math.round(ms / 16))
    for (let i = 1; i <= steps; i += 1) {
      const k = i / steps
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
      const x = this.cursor.x + (to.x - this.cursor.x) * ease
      const y = this.cursor.y + (to.y - this.cursor.y) * ease
      await this.page.mouse.move(x, y)
      this.events.push({ t: this.now(), type: 'move', x, y })
      await this.page.waitForTimeout(ms / steps)
    }
    this.cursor = to
  }

  async click(target: Locator) {
    await this.moveTo(target)
    await this.page.waitForTimeout(180)
    this.events.push({ t: this.now(), type: 'click', ...this.cursor })
    await this.page.mouse.click(this.cursor.x, this.cursor.y)
  }

  hold(ms: number) {
    return this.page.waitForTimeout(ms)
  }
}

const TAKES: Take[] = [
  {
    name: 'landing',
    shows: 'The landing page: the hero receipt replays the recorded sandbox run and seals it.',
    async run(shot) {
      await shot.page.goto(`${SITE}/`, { waitUntil: 'networkidle' })
      await shot.mark('hero', shot.page.locator('.hero__tape'))
      await shot.hold(6500)
    },
  },
  {
    name: 'store',
    shows:
      'Leaky Llama, the demo store under test: its shelf, socks in a cart at the PayPal button, and its leak switches.',
    async run(shot) {
      const { page } = shot
      await page.goto(`${STORE}/`, { waitUntil: 'networkidle' })
      const card = (name: string) =>
        page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) })
      const socks = card('Alpaca-blend trail socks')
      const panniers = card('Waxed canvas panniers')
      await shot.hold(800)
      await shot.mark('shelf', page.getByRole('list').filter({ has: socks }))
      await shot.mark('socks', socks)
      await shot.mark('panniers', panniers)
      await shot.moveTo(socks.getByText('$18.00', { exact: true }), 800)
      await shot.hold(600)
      await shot.moveTo(panniers.getByText('$124.00', { exact: true }), 800)
      await shot.hold(600)
      await shot.click(socks.getByRole('button', { name: 'Add Alpaca-blend trail socks to cart' }))
      await shot.hold(700)
      await shot.click(page.getByRole('link', { name: /^Cart/ }))
      await page.waitForURL('**/cart')
      // PayPal's button draws itself after the page: wait for it, and stop there.
      await page.waitForFunction(PAYPAL_BUTTON_DRAWN, undefined, { timeout: 30_000 })
      await shot.hold(600)
      await shot.mark('cart', page.locator('section[aria-labelledby="cart-heading"]'))
      await shot.mark('pay', page.locator('section[aria-labelledby="pay-heading"]'))
      await shot.mark(
        'paypal',
        page.locator('section[aria-labelledby="pay-heading"] paypal-button'),
      )
      await shot.hold(2400)
      await shot.click(page.getByRole('button', { name: /Leak switches/ }))
      await shot.hold(500)
      await shot.mark('switches', page.locator('#leak-switches'))
      await shot.hold(3200)
    },
  },
  {
    name: 'live-run',
    shows:
      'A live run against Leaky Llama in the PayPal sandbox, then the fixes and a sealed re-run.',
    async run(shot) {
      const { page } = shot
      await page.goto(`${SITE}/#demo`, { waitUntil: 'networkidle' })
      await page.locator('#demo').scrollIntoViewIfNeeded()
      await shot.hold(1200)
      await shot.mark('demo', page.locator('.demo'))
      await shot.watchReceipt()
      await shot.click(page.getByRole('button', { name: 'Unleash the cast' }))
      await shot.mark('run-started')
      const fixes = page.getByRole('button', { name: 'Apply fixes and re-run' })
      await fixes.waitFor({ state: 'visible' })
      await page.waitForFunction(
        () =>
          !(
            [...document.querySelectorAll('button')].find(
              (b) => b.textContent === 'Apply fixes and re-run',
            ) as HTMLButtonElement | undefined
          )?.disabled,
        undefined,
        { timeout: 240_000 },
      )
      await shot.mark('run-done', page.locator('.demo__tape'))
      await shot.hold(2500)
      await shot.click(fixes)
      await shot.mark('rerun-started')
      await page.locator('.demo__was').waitFor({ state: 'visible', timeout: 240_000 })
      await shot.mark('rerun-sealed', page.locator('.demo__tape'))
      await shot.hold(3500)
    },
  },
  {
    name: 'console',
    shows:
      'The console: the leaky run picked, its worst leak clicked, its finding and every line of evidence.',
    async run(shot) {
      const { page } = shot
      await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' })
      await page.locator('.sd-console__laying').waitFor({ state: 'detached', timeout: 60_000 })
      await shot.hold(1500)
      const leakyRun = page.getByRole('button', { name: /all leaky · 74A923AC/ }).first()
      if (await leakyRun.count()) await shot.click(leakyRun)
      await shot.hold(1500)
      // The leak the video follows to PayPal: the Cart Shuffler's order that captured $18.00.
      const worst = page.locator('.sd-tape__pick', { hasText: WORST.order })
      const leak = (await worst.count()) ? worst.first() : page.locator('.sd-tape__pick').first()
      await shot.mark('scoreboard', page.locator('.sd-widget--tape'))
      await shot.mark('leak', leak)
      await shot.click(leak)
      await shot.hold(800)
      const row = (label: string) =>
        page.locator('.sd-finding__evidence > div', { hasText: label }).first()
      await shot.mark('finding', page.locator('.sd-finding').first())
      await shot.mark('detail', page.locator('.sd-finding__detail').first())
      await shot.mark('evidence', page.locator('.sd-finding__evidence').first())
      await shot.mark('captured', row('Captured at PayPal'))
      await shot.mark('cart-at-checkout', row('Cart sent at checkout'))
      await shot.mark('cart-at-capture', row('Cart sent at capture'))
      await shot.mark('shipped', row('Goods shipped'))
      await shot.mark('leak-table', page.getByText('Leaks in every run in view').first())
      // The proof scene stays on the finding while the voiceover works through it.
      await shot.hold(17_000)
    },
  },
  {
    name: 'exhibit',
    shows: 'AI decides vs code decides: the support assistant’s reply beside the sandbox ledger.',
    async run(shot) {
      const { page } = shot
      await page.goto(`${SITE}/#how-it-decides`, { waitUntil: 'networkidle' })
      await shot.hold(1200)
      await shot.mark('exhibit', page.locator('#how-it-decides'))
      await shot.mark('side-ai', page.locator('#how-it-decides .split__side').first())
      await shot.mark('side-code', page.locator('#how-it-decides .split__side').last())
      await shot.mark('chat', page.locator('#how-it-decides .chat'))
      await shot.mark('ledger', page.locator('#how-it-decides .ledger-lines'))
      const lines = page.locator('#how-it-decides li')
      const count = Math.min(await lines.count(), 3)
      for (let i = 0; i < count; i += 1) {
        await shot.moveTo(lines.nth(i), 600)
        await shot.hold(1400)
      }
      await shot.hold(1500)
    },
  },
  {
    name: 'ci',
    shows: 'CLI and CI: the GitHub Actions tab and the pull-request comment from the recorded run.',
    async run(shot) {
      const { page } = shot
      await page.goto(`${SITE}/#cli`, { waitUntil: 'networkidle' })
      await shot.hold(1000)
      await shot.mark('terminal', page.locator('#cli .term').first())
      await shot.click(page.getByRole('tab', { name: 'GitHub Actions' }))
      await shot.hold(800)
      await shot.mark('workflow', page.locator('#cli .ci-grid .term').first())
      const comment = page.locator('#cli figure').first()
      await comment.scrollIntoViewIfNeeded()
      await shot.mark('comment', comment)
      await shot.hold(4000)
    },
  },
  {
    name: 'dashboard',
    shows:
      "PayPal's own record: the sandbox business account's details for the capture the console quotes.",
    signedIn: true,
    async run(shot) {
      const { page } = shot
      await page.goto(
        `https://www.sandbox.paypal.com/unifiedtransactions/details/payment/${WORST.captureId}`,
        { waitUntil: 'domcontentloaded' },
      )
      const id = page.getByText(WORST.captureId, { exact: true }).first()
      const amount = page.getByText(`${WORST.captured} USD`, { exact: true }).first()
      await id.waitFor({ timeout: 60_000 })
      await shot.hold(1200)
      await shot.mark('heading', page.getByText('Payment received from').first())
      await shot.mark('transaction-id', id)
      await shot.mark('amount', amount)
      await shot.moveTo(id, 900)
      await shot.hold(1600)
      await shot.moveTo(amount, 900)
      // The proof scene holds on PayPal's record for up to 9 s after the page settles.
      await shot.hold(5500)
    },
  },
]

async function record(browser: Browser, take: Take) {
  // A signed-in take borrows the window you signed in to: its first context holds the session.
  const signedIn = CDP ? browser.contexts()[0] : undefined
  const context =
    signedIn ??
    (await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SCALE,
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    }))
  const page = await context.newPage()
  if (signedIn) {
    // A tab in the background barely paints, so bring it forward before recording it.
    await page.bringToFront()
    await page.setViewportSize({ width: WIDTH, height: HEIGHT })
  }
  const dir = path.join(RAW, take.name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const frames: { file: string; t: number }[] = []
  // The clock starts with the take, so frames and events share it.
  const shot = new Shot(page)
  const writes: Promise<void>[] = []
  await page.screencast.start({
    size: { width: WIDTH * SCALE, height: HEIGHT * SCALE },
    quality: 92,
    onFrame: ({ data }) => {
      const file = `frame-${String(frames.length).padStart(6, '0')}.jpg`
      frames.push({ file, t: shot.now() })
      writes.push(Promise.resolve(writeFileSync(path.join(dir, file), data)))
    },
  })
  await take.run(shot)
  await page.screencast.stop()
  await Promise.all(writes)
  const ended = shot.now()
  writeFileSync(
    path.join(dir, 'take.json'),
    `${JSON.stringify({ take: take.name, shows: take.shows, site: SITE, scale: SCALE, width: WIDTH, height: HEIGHT, capturedAt: new Date().toISOString(), durationMs: ended, frames, events: shot.events }, null, 1)}\n`,
  )
  // Leave your signed-in window as it was: close only the tab the take used.
  if (signedIn) await page.close()
  else await context.close()
  console.log(`${take.name}: ${frames.length} frames over ${(ended / 1000).toFixed(1)} s`)
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// Signed-in takes run only in a window you signed in to; the others never do.
const takes = TAKES.filter(
  (t) => (wanted.length === 0 || wanted.includes(t.name)) && Boolean(t.signedIn) === Boolean(CDP),
)
const browser = CDP
  ? await chromium.connectOverCDP(CDP)
  : await chromium.launch({ channel: 'chrome' })
try {
  for (const take of takes) await record(browser, take)
} finally {
  // Closing a connected browser would close your window too, so leave it open and exit: the
  // connection would otherwise keep this script running.
  if (CDP) process.exit(0)
  await browser.close()
}
