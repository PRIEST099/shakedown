import { allLeaky, allSealed, type StoreMode } from '@shakedown/core/mode'
import { captureCompleted, captureRefunded } from '@shakedown/core/webhook'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { captureCheckout, createCheckout, type StoreDeps } from './checkout'
import { createPgliteDb, type StoreDb } from './db/client'
import { orders, parseOrderNumber, shipments, webhookDeliveries } from './db/schema'
import { probeOrder } from './probe'
import { FakePayPal, signedHeaders, unsignedHeaders } from './testing/fake-paypal'
import { handleWebhook } from './webhooks'

let db: StoreDb
beforeAll(async () => {
  db = await createPgliteDb()
})

let counter = 0
const eventId = () => {
  counter += 1
  return `WH-TEST-${String(counter).padStart(6, '0')}`
}

/** An order that is awaiting payment, as a customer leaves it at the PayPal step. */
async function awaitingOrder(mode: StoreMode, paypal = new FakePayPal()) {
  const deps: StoreDeps = { db, paypal }
  const created = await createCheckout(deps, {
    lines: [{ sku: 'LL-BTL-750', qty: 1 }],
    email: 'buyer@example.com',
    mode,
  })
  const id = parseOrderNumber(created.orderNumber) as number
  return { deps, paypal, created, id }
}

const completed = (orderNumber: string, at: Date, id = eventId()) =>
  captureCompleted({
    id,
    orderId: orderNumber,
    captureId: `CAP-${orderNumber}`,
    amountCents: 3600,
    createTime: at,
  })

const deliver = (
  deps: StoreDeps,
  event: object,
  headers = signedHeaders,
  campaignMode?: StoreMode,
) => handleWebhook(deps, { raw: JSON.stringify(event), headers, campaignMode })

const shipped = async (id: number) =>
  (await db.select().from(shipments).where(eq(shipments.orderId, id))).length

const t0 = new Date('2026-10-03T10:00:00Z')

describe('the Echo: an unverified "you have been paid"', () => {
  it('leaky ships on a message anyone could have sent', async () => {
    const { deps, created, id } = await awaitingOrder(allLeaky())
    const result = await deliver(deps, completed(created.orderNumber, t0), unsignedHeaders)
    expect(result).toMatchObject({ status: 200, outcome: 'applied' })
    expect(await shipped(id)).toBe(1)
  })

  it('sealed refuses it and moves nothing', async () => {
    const { deps, created, id } = await awaitingOrder(allSealed())
    const result = await deliver(deps, completed(created.orderNumber, t0), unsignedHeaders)
    expect(result).toMatchObject({ status: 400, outcome: 'rejected' })
    expect(await shipped(id)).toBe(0)
  })

  it('sealed fails closed when no webhook ID is configured, even for a genuine event', async () => {
    const paypal = new FakePayPal()
    paypal.canVerify = false
    const { deps, created, id } = await awaitingOrder(allSealed(), paypal)
    const result = await deliver(deps, completed(created.orderNumber, t0))
    expect(result.status).toBe(400)
    expect(result.detail).toMatch(/No webhook ID/)
    expect(await shipped(id)).toBe(0)
  })

  it('sealed acts on a verified one', async () => {
    const { deps, created, id } = await awaitingOrder(allSealed())
    const result = await deliver(deps, completed(created.orderNumber, t0))
    expect(result.outcome).toBe('applied')
    expect(await shipped(id)).toBe(1)
  })
})

describe('the Echo: the same event twice', () => {
  it('leaky applies both deliveries', async () => {
    const { deps, created, id } = await awaitingOrder(allLeaky())
    const event = completed(created.orderNumber, t0)
    await deliver(deps, event)
    await deliver(deps, event)
    expect(await shipped(id)).toBe(2)
    const outcomes = (
      await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.orderId, id))
    ).map((row) => row.outcome)
    expect(outcomes).toEqual(['applied', 'applied'])
  })

  it('sealed applies it once and records the repeat as a duplicate', async () => {
    const { deps, created, id } = await awaitingOrder(allSealed())
    const event = completed(created.orderNumber, t0)
    const [a, b] = await Promise.all([deliver(deps, event), deliver(deps, event)])
    expect([a.outcome, b.outcome].sort()).toEqual(['applied', 'duplicate'])
    expect(await shipped(id)).toBe(1)
  })
})

describe('the Echo: a payment event arriving after the refund', () => {
  const run = async (mode: StoreMode) => {
    const { deps, created, id } = await awaitingOrder(mode)
    await deliver(deps, completed(created.orderNumber, t0))
    await deliver(
      deps,
      captureRefunded({
        id: eventId(),
        orderId: created.orderNumber,
        captureId: `CAP-${created.orderNumber}`,
        amountCents: 3600,
        createTime: new Date(t0.getTime() + 60_000),
      }),
    )
    const replay = await deliver(deps, completed(created.orderNumber, t0))
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    return { replay, order, shipments: await shipped(id) }
  }

  it('leaky lets it undo the refund and ship again', async () => {
    const { replay, order, shipments: count } = await run(allLeaky())
    expect(replay.outcome).toBe('applied')
    expect(order?.status).toBe('fulfilled')
    expect(count).toBe(2)
  })

  it('sealed ignores it as stale and stays refunded', async () => {
    const { replay, order, shipments: count } = await run(allSealed())
    expect(replay.outcome).toBe('stale')
    expect(order?.status).toBe('refunded')
    expect(count).toBe(1)
  })
})

describe('the listener in general', () => {
  it('keeps every delivery byte for byte, whatever happened to it', async () => {
    const { deps, created, id } = await awaitingOrder(allSealed())
    const raw = `{"id":"${eventId()}",   "event_type":"PAYMENT.CAPTURE.COMPLETED","create_time":"2026-10-03T10:00:00Z","resource":{"custom_id":"${created.orderNumber}","amount":{"currency_code":"USD","value":"36.00"}}}`
    await handleWebhook(deps, { raw, headers: unsignedHeaders })
    const [row] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.orderId, id))
    expect(row?.raw).toBe(raw)
    expect(row?.outcome).toBe('rejected')
    expect(row?.verification).toBe('FAILURE')
  })

  it('rejects a body that is not an event', async () => {
    const { deps } = await awaitingOrder(allLeaky())
    const result = await handleWebhook(deps, { raw: 'hello', headers: signedHeaders })
    expect(result).toMatchObject({ status: 400, outcome: 'rejected' })
  })

  it('acknowledges an event for an order it does not know', async () => {
    const { deps } = await awaitingOrder(allLeaky())
    const result = await deliver(deps, completed('LL-99999999', t0))
    expect(result).toMatchObject({ status: 200, outcome: 'unmatched' })
  })

  it('lets a signed campaign token choose the switches for its delivery', async () => {
    const { deps, created, id } = await awaitingOrder(allLeaky())
    const result = await deliver(
      deps,
      completed(created.orderNumber, t0),
      unsignedHeaders,
      allSealed(),
    )
    expect(result.outcome).toBe('rejected')
    expect(await shipped(id)).toBe(0)
  })

  it('does not ship twice when the checkout already did and fulfilment is idempotent', async () => {
    const { deps, created, id } = await awaitingOrder({ ...allLeaky(), 'double-clicker': 'sealed' })
    await captureCheckout(deps, { paypalOrderId: created.paypalOrderId })
    await deliver(deps, completed(created.orderNumber, t0))
    expect(await shipped(id)).toBe(1)
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    expect(order?.status).toBe('fulfilled')
  })
})

describe('the Second Opinion: a dispute arrives', () => {
  const dispute = (orderNumber: string, captureId: string) => ({
    id: eventId(),
    event_type: 'CUSTOMER.DISPUTE.CREATED',
    create_time: '2026-10-03T12:00:00Z',
    resource: {
      dispute_id: `PP-D-${counter}`,
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      status: 'OPEN',
      dispute_amount: { currency_code: 'USD', value: '36.00' },
      disputed_transactions: [{ seller_transaction_id: captureId }],
      custom_id: orderNumber,
    },
  })

  const refundedThenDisputed = async (mode: StoreMode) => {
    const { deps, created, id } = await awaitingOrder(mode)
    await captureCheckout(deps, { paypalOrderId: created.paypalOrderId })
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    await deliver(
      deps,
      captureRefunded({
        id: eventId(),
        orderId: created.orderNumber,
        captureId: order?.captureId ?? '',
        amountCents: 1800,
        createTime: new Date('2026-10-03T11:00:00Z'),
      }),
    )
    await deliver(deps, dispute(created.orderNumber, order?.captureId ?? ''))
    return probeOrder(db, created.orderNumber)
  }

  it('sealed holds it for review, with the refund already issued in the sums', async () => {
    const probe = await refundedThenDisputed(allSealed())
    expect(probe.status).toBe('disputed')
    expect(probe.disputes?.[0]).toMatchObject({ response: 'held_for_review' })
    expect(probe.disputes?.[0]?.detail).toMatch(/already refunded 18\.00/)
    expect(probe.disputes?.[0]?.detail).toMatch(/18\.00 more than was ever captured/)
  })

  it('leaky records it and checks nothing', async () => {
    const probe = await refundedThenDisputed(allLeaky())
    expect(probe.disputes?.[0]).toMatchObject({ response: 'none', detail: null })
  })
})
