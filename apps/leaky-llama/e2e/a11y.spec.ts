import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/** The store's pages, checked with axe against WCAG 2.2 A and AA. Serious or critical fails. */
const PAGES = ['/', '/cart', '/orders', '/policy', '/support', '/no-such-page']
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const path of PAGES) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
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
