import path from 'node:path'
import { allLeaky, allSealed, type StoreMode } from '@shakedown/core/mode'
import {
  CARD_DECLINE_TRIGGER,
  confirmPaymentSource,
  getCapture,
  PayPalSandboxClient,
  sandboxTestCard,
} from '@shakedown/paypal'
import { beforeAll, describe, expect, it } from 'vitest'
import { captureCheckout, createCheckout, type StoreDeps } from './checkout'
import { createPgliteDb, type StoreDb } from './db/client'
import { livePayPal } from './paypal'
import { probeOrder } from './probe'

/**
 * The store's checkout against the real PayPal sandbox, the way card fields drive it: our server
 * creates the order, the card is attached with confirm-payment-source, our server captures.
 * Opt-in, because it makes real sandbox calls: RUN_SANDBOX_TESTS=1 pnpm test
 */
const enabled = process.env.RUN_SANDBOX_TESTS === '1'
// Next skips .env.local under NODE_ENV=test, so read the repo's copy directly.
if (enabled) process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env.local'))

describe.skipIf(!enabled)('checkout against the PayPal sandbox', () => {
  let db: StoreDb
  let deps: StoreDeps
  let client: PayPalSandboxClient

  beforeAll(async () => {
    db = await createPgliteDb()
    deps = { db, paypal: livePayPal() }
    client = new PayPalSandboxClient({
      clientId: process.env.PAYPAL_CLIENT_ID ?? '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
    })
  })

  const buy = async (mode: StoreMode, cardholder = 'Sandbox Customer') => {
    const created = await createCheckout(deps, {
      lines: [{ sku: 'LL-BTL-750', qty: 1 }],
      email: 'sandbox-buyer@example.com',
      mode,
    })
    await confirmPaymentSource(client, created.paypalOrderId, sandboxTestCard(cardholder))
    return created
  }

  it('takes a real card payment and ships once', async () => {
    const created = await buy(allSealed())
    const outcome = await captureCheckout(deps, { paypalOrderId: created.paypalOrderId })
    expect(outcome.kind).toBe('paid')
    const probe = await probeOrder(db, created.orderNumber)
    expect(probe).toMatchObject({ status: 'fulfilled', fulfillmentCount: 1, capturedCents: 3600 })
    // Grade from PayPal's ledger, not the store's word.
    const capture = await getCapture(client, String(probe.captureId))
    expect(capture.data.status).toBe('COMPLETED')
    console.info(
      `  paid: ${created.orderNumber} · order ${created.paypalOrderId} · capture ${probe.captureId}`,
    )
  })

  it('the Bouncer: what a real decline does to leaky and sealed checkouts', async () => {
    const report: string[] = []
    for (const [label, mode] of [
      ['leaky', allLeaky()],
      ['sealed', allSealed()],
    ] as const) {
      const created = await buy(mode, CARD_DECLINE_TRIGGER)
      let outcome: string
      try {
        outcome = (await captureCheckout(deps, { paypalOrderId: created.paypalOrderId })).kind
      } catch (error) {
        outcome = `error: ${(error as Error).message}`
      }
      const probe = await probeOrder(db, created.orderNumber)
      const ledger = probe.captureId
        ? (await getCapture(client, probe.captureId)).data.status
        : 'no capture'
      report.push(
        `${label}: store says ${outcome}, shipped ${probe.fulfillmentCount}, PayPal capture ${ledger}`,
      )
      if (label === 'sealed') expect(probe.fulfillmentCount).toBe(0)
    }
    console.info(`  ${report.join('\n  ')}`)
  })

  it('the Double-Clicker: a retried capture', async () => {
    const report: string[] = []
    for (const [label, mode] of [
      ['leaky', allLeaky()],
      ['sealed', allSealed()],
    ] as const) {
      const created = await buy(mode)
      await captureCheckout(deps, { paypalOrderId: created.paypalOrderId })
      const retry = await captureCheckout(deps, { paypalOrderId: created.paypalOrderId })
      const probe = await probeOrder(db, created.orderNumber)
      report.push(`${label}: retry ${retry.kind}, shipped ${probe.fulfillmentCount}`)
      expect(probe.fulfillmentCount).toBe(label === 'leaky' ? 2 : 1)
    }
    console.info(`  ${report.join('\n  ')}`)
  })
})
