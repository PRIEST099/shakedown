/**
 * Screenshots for the Devpost gallery. Playwright opens the site in Chrome, waits for each view to
 * settle, and saves it to public/gallery/raw/<name>.png: 1440 CSS pixels wide at twice the density.
 * The `Gallery` composition then frames each one with a headline in plain words.
 *
 *   SITE_URL=https://shakedown-web.onrender.com pnpm --filter @shakedown/video gallery:shots [name …]
 *
 * Names: hero how cast decides cli ci run sealed console finding (default: all). The live run goes
 * to Leaky Llama in the PayPal sandbox, exactly as the site's own demo does: sandbox calls only, no
 * Claude. Nothing is captured from any page but Shakedown's own.
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'

const SITE = process.env.SITE_URL?.trim() || 'https://shakedown-web.onrender.com'
const RAW = path.resolve(import.meta.dirname, '../public/gallery/raw')
const RUN_TIMEOUT = 240_000
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const want = (...names: string[]) => wanted.length === 0 || names.some((n) => wanted.includes(n))

// Strings, not functions: tsx would add a helper the page doesn't have.
const scrollTo = (selector: string, offset: number) =>
  `window.scrollTo(0, document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top + window.scrollY - ${offset})`
const enabled = (label: string) =>
  `!([...document.querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(label)}) || { disabled: true }).disabled`

/** Below the hero, the sticky header would sit on top of whatever is being shown. */
const unstickHeader = (page: Page) =>
  page.addStyleTag({ content: '.site-header { position: static !important; }' })

async function show(page: Page, selector: string, offset = 40, settleMs = 1800) {
  await page.evaluate(scrollTo(selector, offset))
  await page.waitForTimeout(settleMs)
}

async function save(page: Page, name: string) {
  await page.screenshot({ path: path.join(RAW, `${name}.png`) })
  console.log(`saved ${name}.png`)
}

mkdirSync(RAW, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 800 }, deviceScaleFactor: 2 })

try {
  if (want('hero', 'how', 'cast', 'decides', 'cli', 'ci')) {
    await page.goto(`${SITE}/`, { waitUntil: 'networkidle' })
    if (want('hero')) {
      await page.waitForTimeout(9000) // the hero receipt replays the recorded run, then seals it
      await save(page, 'hero')
    }
    await unstickHeader(page)
    for (const [name, selector] of [
      ['how', '#how'],
      ['cast', '#cast'],
      ['decides', '#how-it-decides'],
    ] as const) {
      if (!want(name)) continue
      await show(page, selector)
      await save(page, name)
    }
    if (want('cli', 'ci')) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await show(page, '#cli [role="tablist"]')
      if (want('cli')) await save(page, 'cli')
      if (want('ci')) {
        await page.getByRole('tab', { name: 'GitHub Actions' }).click()
        await page.waitForTimeout(1200)
        await save(page, 'ci')
      }
      await page.setViewportSize({ width: 1440, height: 800 })
    }
  }

  if (want('run', 'sealed')) {
    await page.goto(`${SITE}/#demo`, { waitUntil: 'networkidle' })
    await unstickHeader(page)
    await show(page, '.demo', 40, 800)
    await page.getByRole('button', { name: 'Unleash the cast' }).click()
    await page.waitForFunction(enabled('Apply fixes and re-run'), undefined, {
      timeout: RUN_TIMEOUT,
    })
    await page.waitForTimeout(2500)
    await show(page, '.demo', 40, 600)
    await save(page, 'run')
    if (want('sealed')) {
      await page.getByRole('button', { name: 'Apply fixes and re-run' }).click()
      await page.locator('.demo__was').waitFor({ state: 'visible', timeout: RUN_TIMEOUT })
      await page.waitForTimeout(3000)
      await show(page, '.demo', 40, 600)
      await save(page, 'sealed')
    }
  }

  if (want('console', 'finding')) {
    // The console's run page is taller than the site's sections: a laptop-height window shows it.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' })
    await page.locator('.sd-console__laying').waitFor({ state: 'detached', timeout: 60_000 })
    await page.waitForTimeout(1500)
    const leakyRun = page.getByRole('button', { name: /all leaky · 74A923AC/ }).first()
    if (await leakyRun.count()) await leakyRun.click()
    await page.waitForTimeout(2000)
    if (want('console')) await save(page, 'console')
    if (want('finding')) {
      // Picking a leak narrows every widget to it, so this view is shot on its own.
      await page.locator('.sd-tape__pick').first().click()
      await page.waitForTimeout(2000)
      await save(page, 'finding')
    }
  }
} finally {
  await browser.close()
}
