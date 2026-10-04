import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'

// PayPal sandbox order, capture and refund IDs, and webhook event IDs, as the site quotes them.
const PAYPAL_ID = /\b(?:[0-9A-Z]{17}|WH-[0-9A-Z]{12})\b/g
const RECORDED = path.resolve(import.meta.dirname, '../fixtures/recorded')
const recorded = readdirSync(RECORDED)
  .filter((file) => file.endsWith('.json'))
  .map((file) => readFileSync(path.join(RECORDED, file), 'utf8'))
  .join('\n')

// The hero's one announcement, made when the recording finishes.
const announcement = (page: Page) => page.locator('.hero__tape > p[aria-live="polite"]')
const total = (page: Page, tone: 'leak' | 'sealed') =>
  page.locator(`.hero .sd-tape--${tone} .sd-tape__total-value .sd-sr-only`)

test('the hero prints the recorded run, then seals it to $0.00', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Meet your customers from hell. In the sandbox.',
  )
  await expect(page.locator('.hero .sd-tape__meta').first()).toHaveText(
    'Sandbox · Leaky Llama Supply Co. · run 74A923AC',
  )
  await expect(announcement(page)).toHaveText(
    'Recorded run: −$491.00 would have leaked across 4 customers. After the fixes: $0.00.',
  )
  await expect(page.locator('.hero .sd-tape--leak')).toHaveCount(0)
  await expect(total(page, 'sealed')).toHaveText('$0.00')
  await expect(page.locator('.hero__caption')).toContainText('Recorded sandbox run')
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the hero shows the before and after tapes, still', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.hero .sd-tape')).toHaveCount(2)
    await expect(total(page, 'leak')).toHaveText('−$491.00')
    await expect(total(page, 'sealed')).toHaveText('$0.00')
    await expect(page.getByText('Was −$491.00 before the fixes.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replay ↺' })).toHaveCount(0)
  })

  test('a phone shows the sealed tape and what it was', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('.hero .sd-tape--sealed')).toBeVisible()
    await expect(page.locator('.hero .sd-tape--leak')).toBeHidden()
    await expect(page.getByText('Was −$491.00 before the fixes.')).toBeVisible()
  })

  test('every PayPal ID on the page comes from a recorded sandbox run', async ({ page }) => {
    await page.goto('/')
    // Both tapes stay on the page, so every ID the hero can show is there at once.
    await expect(page.locator('.hero .sd-tape')).toHaveCount(2)
    // Node by node, so neighbouring text (a table cell, the next line) never runs into an ID.
    const text = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return ''
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
      const parts: string[] = []
      while (walker.nextNode()) parts.push(walker.currentNode.nodeValue ?? '')
      return parts.join('\n')
    })
    const ids = [...new Set(text.match(PAYPAL_ID) ?? [])]
    expect(ids.length).toBeGreaterThanOrEqual(8)
    for (const id of ids) expect(recorded, `${id} is not in fixtures/recorded`).toContain(id)
  })
})

for (const route of ['/', '/docs']) {
  test(`${route} fits a 360 px phone with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto(route)
    // Sections below the demo render only as they near the viewport: visit them all first.
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0; y < height; y += 600) {
      await page.evaluate((top) => window.scrollTo(0, top), y)
      await page.waitForTimeout(50)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBe(0)
  })
}

test('the old paths redirect', async ({ request }) => {
  const redirects: [from: string, to: string][] = [
    ['/console', '/app'],
    ['/demo', '/app'],
    ['/judges', '/#judges'],
  ]
  for (const [from, to] of redirects) {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status(), from).toBe(307)
    expect(res.headers().location, from).toBe(to)
  }
})
