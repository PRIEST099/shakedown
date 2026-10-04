import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Every page, in both themes, checked with axe against WCAG 2.2 A and AA. Anything axe calls
 * serious or critical fails the build.
 */
const PAGES = ['/', '/docs', '/app', '/no-such-page']
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme === 'light' ? 'Day' : 'Night'} shift`, () => {
    test.use({ colorScheme: scheme })

    for (const path of PAGES) {
      test(`${path} has no serious accessibility problems`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        // The hero's lines fade in as they print; judge the receipt once it has printed.
        if (path === '/') {
          await expect(page.locator('.hero__tape > p[aria-live="polite"]')).not.toBeEmpty()
        }
        const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
        const serious = results.violations
          .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
          .map(
            (violation) =>
              `${violation.id} (${violation.impact}): ${violation.nodes
                .slice(0, 3)
                .map((node) => node.target.join(' '))
                .join(' | ')}`,
          )
        expect(serious).toEqual([])
      })
    }
  })
}

test('the code tabs work from the keyboard', async ({ page }) => {
  await page.goto('/#cli')
  const tabs = page.getByRole('tablist').first().getByRole('tab')
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
})

test('a page that does not exist says so, and offers a way back', async ({ page }) => {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'This page isn’t on the receipt.',
  )
  await expect(page.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/')
})
