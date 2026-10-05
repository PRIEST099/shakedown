import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * The console stays readable: the leak waterfall is drawn for the box it's in, so its words never
 * shrink below 12 px, and Expand opens a widget large, in a dialog that Esc closes.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.goto('/app')
  await page.locator('.sd-console__laying').waitFor({ state: 'detached' })
})

const smallestText = (texts: Element[]) =>
  Math.min(...texts.map((text) => Number.parseFloat(getComputedStyle(text).fontSize)))

test('the waterfall is drawn for its box, with words of 12 px or more', async ({ page }) => {
  const plot = page.locator('.sd-waterfall__plot').first()
  await expect(plot.locator('svg')).toBeVisible()
  const box = await plot.boundingBox()
  const svg = await plot.locator('svg').boundingBox()
  expect(Math.round(svg?.height ?? 0)).toBe(Math.floor(box?.height ?? -1))
  expect(await plot.locator('text').evaluateAll(smallestText)).toBeGreaterThanOrEqual(12)
})

test('Expand opens a widget large, and Esc closes it', async ({ page }) => {
  await page.locator('.sd-waterfall').first().hover()
  await page.getByRole('button', { name: 'Expand' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Where it would have gone' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  const svg = await dialog.locator('.sd-waterfall__plot svg').boundingBox()
  expect(svg?.width ?? 0).toBeGreaterThan(900)
  expect(await dialog.locator('text').evaluateAll(smallestText)).toBeGreaterThanOrEqual(15)

  const results = await new AxeBuilder({ page }).include('.sd-expanded').withTags(WCAG).analyze()
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious.map((violation) => violation.id)).toEqual([])

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
