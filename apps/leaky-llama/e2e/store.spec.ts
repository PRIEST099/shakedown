import { expect, test } from '@playwright/test'

const card = (title: string) => `iframe[title="${title} PayPal Card Field"]`

test('a customer buys a bottle by card in the sandbox, and it ships once', async ({ page }) => {
  const captures: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/capture'))
      captures.push(request.url())
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Add Insulated bottle, 750 ml to cart' }).click()
  await expect(page.getByRole('link', { name: /Cart/ })).toContainText('1')
  await page.getByRole('link', { name: /Cart/ }).click()

  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
  await page.getByLabel('Email for your receipt').fill('playwright-buyer@example.com')

  // PayPal's hosted card fields: each is an iframe inside the SDK's own web component.
  // They listen for real keystrokes, so type rather than fill, then check what landed: a field
  // can move focus on to the next one by itself, and a keystroke can arrive mid-move.
  const type = async (field: string, value: string, digitsOnly = true) => {
    const input = page.frameLocator(card(field)).locator('input')
    const landed = async () => {
      const text = await input.inputValue()
      return digitsOnly ? text.replace(/\D/g, '') : text
    }
    await expect(async () => {
      await input.click()
      await input.press('ControlOrMeta+a')
      await input.press('Backspace')
      await input.pressSequentially(value, { delay: 40 })
      expect(await landed()).toBe(value)
    }).toPass({ timeout: 30_000 })
  }
  await type('Number', '4012888888881881')
  await type('Expiry', '1230')
  await type('Cvv', '123')
  await type('Name', 'Playwright Customer', false)
  // The store enables the button only once PayPal reports the card fields valid.
  const pay = page.getByRole('button', { name: /Pay \$36\.00 by card/ })
  await expect(pay).toBeEnabled()
  await pay.click()

  await expect(page).toHaveURL(/\/orders\/LL-\d+\?placed=1/, { timeout: 60_000 })
  await expect(page.getByText('Thanks! Your order is placed.')).toBeVisible()
  await expect(page.getByText('Shipped', { exact: true })).toBeVisible()
  await expect(page.getByText(/^Shipment 1/)).toBeVisible()
  await expect(page.getByText(/^Shipment 2/)).toHaveCount(0)
  // One payment, one capture request. (A re-rendering effect once sent thousands.)
  expect(captures).toHaveLength(1)

  await page.getByRole('link', { name: '← All your orders' }).click()
  await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible()
  await expect(page.getByText('1 × Insulated bottle, 750 ml')).toBeVisible()
})

/** Flip one switch and wait until the store has stored it. */
async function flip(
  page: import('@playwright/test').Page,
  persona: string,
  seal: 'Leaky' | 'Sealed',
) {
  const group = page.getByRole('group', { name: persona })
  await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/api/mode') && res.ok()),
    group.getByRole('button', { name: seal }).click(),
  ])
  return group
}

test('a leak switch flips and stays flipped', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Leak switches/ }).click()
  const echo = await flip(page, 'The Echo', 'Sealed')
  await expect(echo.getByRole('button', { name: 'Sealed' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /Leak switches/ })).toContainText('1 sealed')

  await page.reload()
  await page.getByRole('button', { name: /Leak switches/ }).click()
  await expect(
    page.getByRole('group', { name: 'The Echo' }).getByRole('button', { name: 'Sealed' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('the Help page says how Lulu is wired', async ({ page }) => {
  await page.goto('/support')
  await expect(page.getByText(/POLICY LAWYER SWITCH: LEAKY/)).toBeVisible()
  await page.getByRole('button', { name: /Leak switches/ }).click()
  await flip(page, 'The Policy Lawyer', 'Sealed')
  await page.reload()
  await expect(page.getByText(/POLICY LAWYER SWITCH: SEALED/)).toBeVisible()
})

test('the refund policy is published', async ({ page }) => {
  await page.goto('/policy')
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(5)
})

test('the probe API answers only with the shared secret', async ({ request }) => {
  const denied = await request.get('/api/probe/orders/LL-10001')
  expect(denied.status()).toBe(403)
})

test('the ownership file is served', async ({ request }) => {
  const res = await request.get('/.well-known/shakedown.txt')
  expect(res.status()).toBe(200)
  expect((await res.text()).length).toBeGreaterThanOrEqual(16)
})
