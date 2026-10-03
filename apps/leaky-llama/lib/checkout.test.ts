import { allLeaky, allSealed, type StoreMode } from '@shakedown/core/mode'
import { PayPalApiError } from '@shakedown/paypal'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { captureCheckout, createCheckout, type StoreDeps } from './checkout'
import { createPgliteDb, type StoreDb } from './db/client'
import { orders, shipments } from './db/schema'
import { FakePayPal } from './testing/fake-paypal'

let db: StoreDb

beforeAll(async () => {
  db = await createPgliteDb()
})

const deps = (paypal = new FakePayPal()): StoreDeps & { paypal: FakePayPal } => ({ db, paypal })

const leakyExcept = (sealed: Partial<StoreMode>): StoreMode => ({ ...allLeaky(), ...sealed })
const sealedExcept = (leaky: Partial<StoreMode>): StoreMode => ({ ...allSealed(), ...leaky })

const socks = [{ sku: 'LL-SOCK-2', qty: 1 }]

const shipmentsFor = async (paypalOrderId: string) => {
  const [order] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId))
  if (!order) throw new Error('order missing')
  return db.select().from(shipments).where(eq(shipments.orderId, order.id))
}

describe('createCheckout', () => {
  it('prices from the catalog when sealed, whatever the browser claims', async () => {
    const created = await createCheckout(deps(), {
      lines: [{ sku: 'LL-PNR-PR', qty: 1, unitCents: 100 }],
      email: 'a@example.com',
      mode: allSealed(),
    })
    expect(created.amountCents).toBe(12400)
  })

  it('takes the browser at its word when the Cart Shuffler switch is leaky', async () => {
    const created = await createCheckout(deps(), {
      lines: [{ sku: 'LL-PNR-PR', qty: 1, unitCents: 100 }],
      email: 'a@example.com',
      mode: allLeaky(),
    })
    expect(created.amountCents).toBe(100)
  })

  it('turns a double submit into one order when sealed, at our end and at PayPal', async () => {
    const paypal = new FakePayPal()
    const input = { lines: socks, email: 'b@example.com', checkoutKey: 'key-1', mode: allSealed() }
    const [first, second] = await Promise.all([
      createCheckout(deps(paypal), input),
      createCheckout(deps(paypal), input),
    ])
    expect(second.paypalOrderId).toBe(first.paypalOrderId)
    expect(paypal.orders.size).toBe(1)
    const rows = await db.select().from(orders).where(eq(orders.checkoutKey, 'key-1'))
    expect(rows).toHaveLength(1)
    expect(
      paypal.calls
        .filter((c) => c.method === 'createOrder')
        .every((c) => c.requestId === 'create-key-1'),
    ).toBe(true)
  })

  it('still hands both submits one order when PayPal refuses the concurrent repeat', async () => {
    // PayPal may refuse a request ID that is still in flight. Model exactly that.
    class StrictPayPal extends FakePayPal {
      readonly #inFlight = new Set<string>()
      override async createOrder(body: Record<string, unknown>, requestId?: string) {
        if (requestId && this.#inFlight.has(requestId)) {
          throw new PayPalApiError({
            status: 409,
            message: 'Request in progress',
            issue: 'DUPLICATE_REQUEST',
          })
        }
        if (requestId) this.#inFlight.add(requestId)
        await new Promise((resolve) => setTimeout(resolve, 50))
        try {
          return await super.createOrder(body, requestId)
        } finally {
          if (requestId) this.#inFlight.delete(requestId)
        }
      }
    }
    const paypal = new StrictPayPal()
    const input = {
      lines: socks,
      email: 'race@example.com',
      checkoutKey: 'key-race',
      mode: allSealed(),
    }
    const [first, second] = await Promise.all([
      createCheckout(deps(paypal), input),
      createCheckout(deps(paypal), input),
    ])
    expect(second.paypalOrderId).toBe(first.paypalOrderId)
    expect(paypal.orders.size).toBe(1)
  })

  it('opens a fresh order on every submit when the Double-Clicker switch is leaky', async () => {
    const paypal = new FakePayPal()
    const input = { lines: socks, email: 'c@example.com', checkoutKey: 'key-2', mode: allLeaky() }
    const first = await createCheckout(deps(paypal), input)
    const second = await createCheckout(deps(paypal), input)
    expect(second.paypalOrderId).not.toBe(first.paypalOrderId)
    expect(paypal.orders.size).toBe(2)
  })

  it('refuses a bad cart or email before touching PayPal', async () => {
    const paypal = new FakePayPal()
    await expect(
      createCheckout(deps(paypal), { lines: [], email: 'd@example.com', mode: allSealed() }),
    ).rejects.toThrow(/empty/)
    await expect(
      createCheckout(deps(paypal), {
        lines: [{ sku: 'NOPE', qty: 1 }],
        email: 'd@example.com',
        mode: allSealed(),
      }),
    ).rejects.toThrow(/Unknown product/)
    await expect(
      createCheckout(deps(paypal), { lines: socks, email: 'not-an-email', mode: allSealed() }),
    ).rejects.toThrow(/email/)
    await expect(
      createCheckout(deps(paypal), {
        lines: [{ sku: 'LL-SOCK-2', qty: 0 }],
        email: 'd@example.com',
        mode: allSealed(),
      }),
    ).rejects.toThrow(/Quantity/)
    expect(paypal.calls).toHaveLength(0)
  })
})

describe('captureCheckout', () => {
  it('ships once on a normal payment', async () => {
    const d = deps()
    const created = await createCheckout(d, {
      lines: socks,
      email: 'e@example.com',
      mode: allSealed(),
    })
    const outcome = await captureCheckout(d, { paypalOrderId: created.paypalOrderId })
    expect(outcome).toMatchObject({ kind: 'paid', shipped: true })
    expect(await shipmentsFor(created.paypalOrderId)).toHaveLength(1)
  })

  describe('the Bouncer: an order COMPLETED around a DECLINED capture', () => {
    const run = async (mode: StoreMode) => {
      const paypal = new FakePayPal()
      paypal.nextBehaviour = 'decline-inside-completed-order'
      const d = deps(paypal)
      const created = await createCheckout(d, { lines: socks, email: 'f@example.com', mode })
      return {
        created,
        outcome: await captureCheckout(d, { paypalOrderId: created.paypalOrderId }),
      }
    }

    it('ships when leaky, because it read the order status', async () => {
      const { created, outcome } = await run(leakyExcept({}))
      expect(outcome.kind).toBe('paid')
      expect(await shipmentsFor(created.paypalOrderId)).toHaveLength(1)
    })

    it('declines when sealed, because it read the capture status', async () => {
      const { created, outcome } = await run(sealedExcept({}))
      expect(outcome.kind).toBe('declined')
      expect(await shipmentsFor(created.paypalOrderId)).toHaveLength(0)
    })
  })

  it('declines on an INSTRUMENT_DECLINED error either way', async () => {
    for (const mode of [allLeaky(), allSealed()]) {
      const paypal = new FakePayPal()
      paypal.nextBehaviour = 'decline-error'
      const d = deps(paypal)
      const created = await createCheckout(d, { lines: socks, email: 'g@example.com', mode })
      expect((await captureCheckout(d, { paypalOrderId: created.paypalOrderId })).kind).toBe(
        'declined',
      )
    }
  })

  it('holds a pending capture instead of shipping', async () => {
    const paypal = new FakePayPal()
    paypal.nextBehaviour = 'pending'
    const d = deps(paypal)
    const created = await createCheckout(d, {
      lines: socks,
      email: 'h@example.com',
      mode: allSealed(),
    })
    expect((await captureCheckout(d, { paypalOrderId: created.paypalOrderId })).kind).toBe('held')
    expect(await shipmentsFor(created.paypalOrderId)).toHaveLength(0)
  })

  describe('the Double-Clicker: capture retried', () => {
    it('ships twice when leaky, treating "already captured" as a new success', async () => {
      const d = deps()
      const created = await createCheckout(d, {
        lines: socks,
        email: 'i@example.com',
        mode: allLeaky(),
      })
      await captureCheckout(d, { paypalOrderId: created.paypalOrderId })
      const retry = await captureCheckout(d, { paypalOrderId: created.paypalOrderId })
      expect(retry.kind).toBe('paid')
      expect(await shipmentsFor(created.paypalOrderId)).toHaveLength(2)
    })

    it('ships once when sealed: same request ID, same answer, one shipment', async () => {
      const paypal = new FakePayPal()
      const d = deps(paypal)
      const created = await createCheckout(d, {
        lines: socks,
        email: 'j@example.com',
        mode: allSealed(),
      })
      const [a, b] = await Promise.all([
        captureCheckout(d, { paypalOrderId: created.paypalOrderId }),
        captureCheckout(d, { paypalOrderId: created.paypalOrderId }),
      ])
      expect([a.kind, b.kind]).toEqual(['paid', 'paid'])
      expect(await shipmentsFor(created.paypalOrderId)).toHaveLength(1)
      const captureIds = paypal.calls
        .filter((c) => c.method === 'captureOrder')
        .map((c) => c.requestId)
      expect(new Set(captureIds)).toEqual(new Set([`capture-${created.paypalOrderId}`]))
    })
  })

  describe('the Cart Shuffler: the cart changes after payment', () => {
    const bigger = [{ sku: 'LL-PNR-PR', qty: 2 }]

    it('ships the new cart when leaky, for the price of the old one', async () => {
      const d = deps()
      const created = await createCheckout(d, {
        lines: socks,
        email: 'k@example.com',
        mode: allLeaky(),
      })
      await captureCheckout(d, { paypalOrderId: created.paypalOrderId, clientLines: bigger })
      const [shipment] = await shipmentsFor(created.paypalOrderId)
      expect(shipment?.valueCents).toBe(24800)
      expect(created.amountCents).toBe(1800)
    })

    it('ships what was paid for when sealed', async () => {
      const d = deps()
      const created = await createCheckout(d, {
        lines: socks,
        email: 'l@example.com',
        mode: allSealed(),
      })
      await captureCheckout(d, { paypalOrderId: created.paypalOrderId, clientLines: bigger })
      const [shipment] = await shipmentsFor(created.paypalOrderId)
      expect(shipment?.valueCents).toBe(1800)
    })

    it('holds rather than ships when the captured amount does not match the order', async () => {
      const paypal = new FakePayPal()
      const d = deps(paypal)
      const created = await createCheckout(d, {
        lines: socks,
        email: 'm@example.com',
        mode: allSealed(),
      })
      const order = paypal.orders.get(created.paypalOrderId)
      if (order) order.captureAmountOverride = '1.00'
      const outcome = await captureCheckout(d, { paypalOrderId: created.paypalOrderId })
      expect(outcome.kind).toBe('held')
      expect(await shipmentsFor(created.paypalOrderId)).toHaveLength(0)
    })
  })

  it('says so when the order is not ours', async () => {
    expect((await captureCheckout(deps(), { paypalOrderId: 'PP-UNKNOWN' })).kind).toBe('not_found')
  })
})
