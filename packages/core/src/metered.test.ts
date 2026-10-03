import { describe, expect, it } from 'vitest'
import { Budget, BudgetExceededError } from './budget'
import { Ledger } from './ledger'
import { meter } from './metered'
import type { TargetAdapter } from './target'
import { captureCompleted } from './webhook'

const event = captureCompleted({
  id: 'WH-1',
  orderId: 'ORD-1',
  captureId: 'CAP-1',
  amountCents: 4200,
  createTime: new Date('2026-10-03T00:00:00.000Z'),
})

const fake = (overrides: Partial<TargetAdapter> = {}): TargetAdapter => ({
  name: 'fake',
  origin: 'http://127.0.0.1:1',
  openOrder: async () => ({
    orderId: 'ORD-1',
    captureId: 'CAP-1',
    amountCents: 4200,
    currency: 'USD',
  }),
  deliverWebhook: async () => ({ status: 200, accepted: true, body: '{}' }),
  probeOrder: async () => ({
    orderId: 'ORD-1',
    found: true,
    status: 'fulfilled',
    fulfillmentCount: 1,
    amountCents: 4200,
    currency: 'USD',
  }),
  ...overrides,
})

describe('meter, on a checkout', () => {
  const checkoutTarget = (): TargetAdapter => ({
    ...fake(),
    checkout: {
      catalog: [{ sku: 'LL-BTL-750', name: 'Bottle', priceCents: 3600 }],
      openCheckout: async () => ({
        status: 201,
        storeOrderId: 'LL-1',
        paypalOrderId: 'PP-1',
        amountCents: 3600,
      }),
      // The target's verdict field is called `kind`, like the ledger's own discriminant.
      capture: async () => ({
        status: 200,
        kind: 'paid',
        storeOrderId: 'LL-1',
        captureId: 'CAP-1',
        shipped: true,
      }),
    },
  })

  it("records the target's answer without letting it rename the entry", async () => {
    const ledger = new Ledger()
    const target = meter(checkoutTarget(), { budget: new Budget(), ledger })
    await target.checkout?.openCheckout({
      lines: [{ sku: 'LL-BTL-750', qty: 1 }],
      email: 'c@example.com',
    })
    await target.checkout?.capture('PP-1', { lines: [{ sku: 'LL-PNR-PR', qty: 2 }] })
    const view = ledger.view()
    expect(view.entries.map((entry) => entry.kind)).toEqual(['checkout', 'capture'])
    expect(view.captures('PP-1')).toEqual([
      expect.objectContaining({
        kind: 'capture',
        answer: 'paid',
        captureId: 'CAP-1',
        lines: [{ sku: 'LL-PNR-PR', qty: 2 }],
      }),
    ])
    expect(view.paypalOrderIds()).toEqual(['PP-1'])
  })
})

describe('meter', () => {
  it('records every exchange so the persona never writes its own grade', async () => {
    const ledger = new Ledger()
    const target = meter(fake(), { budget: new Budget(), ledger })
    await target.openOrder({ amountCents: 4200 })
    await target.deliverWebhook(event, { signed: false })
    await target.probeOrder('ORD-1')
    expect(ledger.view().entries.map((entry) => entry.kind)).toEqual([
      'order-opened',
      'delivery',
      'probe',
    ])
    expect(ledger.view().deliveries()[0]?.signed).toBe(false)
  })

  it('treats a delivery as signed unless asked otherwise', async () => {
    const ledger = new Ledger()
    await meter(fake(), { budget: new Budget(), ledger }).deliverWebhook(event)
    expect(ledger.view().deliveries()[0]?.signed).toBe(true)
  })

  it('charges the budget for each call and stops when it runs out', async () => {
    const budget = new Budget({ requests: 2 })
    const target = meter(fake(), { budget, ledger: new Ledger() })
    await target.probeOrder('ORD-1')
    await target.probeOrder('ORD-1')
    await expect(target.probeOrder('ORD-1')).rejects.toThrow(BudgetExceededError)
  })

  it('records a refused connection as a fact of the run, then rethrows', async () => {
    const ledger = new Ledger()
    const target = meter(
      fake({
        deliverWebhook: async () => {
          throw new Error('ECONNREFUSED')
        },
      }),
      { budget: new Budget(), ledger },
    )
    await expect(target.deliverWebhook(event)).rejects.toThrow('ECONNREFUSED')
    expect(ledger.view().deliveries()[0]).toMatchObject({ status: 0, accepted: false })
  })
})
