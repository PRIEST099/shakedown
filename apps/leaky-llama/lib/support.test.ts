import { allSealed } from '@shakedown/core/mode'
import { captureRefunded } from '@shakedown/core/webhook'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { captureCheckout, createCheckout, type StoreDeps } from './checkout'
import { createPgliteDb, type StoreDb } from './db/client'
import { orders, parseOrderNumber, refunds } from './db/schema'
import { supportStore } from './support'
import { FakePayPal, signedHeaders } from './testing/fake-paypal'
import { handleWebhook } from './webhooks'

let db: StoreDb
beforeAll(async () => {
  db = await createPgliteDb()
})

const email = 'lulu-customer@example.com'

/** A paid, shipped order for a $124.00 pair of panniers. */
async function paidOrder() {
  const paypal = new FakePayPal()
  const deps: StoreDeps = { db, paypal }
  const created = await createCheckout(deps, {
    lines: [{ sku: 'LL-PNR-PR', qty: 1 }],
    email,
    mode: allSealed(),
  })
  await captureCheckout(deps, { paypalOrderId: created.paypalOrderId })
  return {
    deps,
    paypal,
    number: created.orderNumber,
    id: parseOrderNumber(created.orderNumber) as number,
  }
}

describe('supportStore', () => {
  it('looks an order up for its own customer, and gives nobody else a clue', async () => {
    const { deps, number } = await paidOrder()
    const store = supportStore(deps)
    const mine = await store.lookupOrder(number, ' Lulu-Customer@Example.com ')
    expect(mine.found && mine.order).toMatchObject({
      orderNumber: number,
      capturedCents: 12400,
      openDispute: false,
    })
    const wrongEmail = await store.lookupOrder(number, 'someone@example.com')
    const noSuchOrder = await store.lookupOrder('LL-99999999', email)
    expect(wrongEmail).toEqual(noSuchOrder)
  })

  it('approves an in-policy refund and issues it through PayPal', async () => {
    const { deps, paypal, number, id } = await paidOrder()
    const outcome = await supportStore(deps).requestRefund({
      orderNumber: number,
      email,
      amountCents: 1800,
      reason: 'Scuffed',
    })
    expect(outcome).toMatchObject({ decision: 'approved', amountCents: 1800 })
    expect(paypal.calls.filter((call) => call.method === 'refundCapture')).toHaveLength(1)
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    expect(order).toMatchObject({ refundedCents: 1800, status: 'partially_refunded' })
  })

  it('escalates a refund above the self-serve limit without paying anything', async () => {
    const { deps, paypal, number } = await paidOrder()
    const outcome = await supportStore(deps).requestRefund({
      orderNumber: number,
      email,
      amountCents: 12400,
      reason: 'Too big',
    })
    expect(outcome.decision).toBe('escalated')
    expect(paypal.calls.filter((call) => call.method === 'refundCapture')).toHaveLength(0)
  })

  it('declines more than was paid, and says how much is left', async () => {
    const { deps, number } = await paidOrder()
    const store = supportStore(deps)
    await store.requestRefund({ orderNumber: number, email, amountCents: 5000, reason: 'Part one' })
    const outcome = await store.requestRefund({
      orderNumber: number,
      email,
      amountCents: 9000,
      reason: 'Part two',
    })
    expect(outcome.decision).toBe('declined')
    expect(outcome.message).toMatch(/74\.00/)
  })

  it('never counts one refund twice when PayPal reports it afterwards', async () => {
    const { deps, number, id } = await paidOrder()
    const store = supportStore(deps)
    const outcome = await store.requestRefund({
      orderNumber: number,
      email,
      amountCents: 1800,
      reason: 'Scuffed',
    })
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    await handleWebhook(deps, {
      raw: JSON.stringify(
        captureRefunded({
          id: 'WH-REFUND-ECHO',
          orderId: number,
          captureId: order?.captureId ?? '',
          amountCents: 1800,
          createTime: new Date(),
        }),
      ).replace(`"id":"${order?.captureId}"`, `"id":"${outcome.refundId}"`),
      headers: signedHeaders,
    })
    const rows = await db.select().from(refunds).where(eq(refunds.orderId, id))
    expect(rows).toHaveLength(1)
    const [after] = await db.select().from(orders).where(eq(orders.id, id))
    expect(after?.refundedCents).toBe(1800)
  })

  it('records a refund the toolkit issued directly, once', async () => {
    const { deps, id } = await paidOrder()
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    const store = supportStore(deps)
    await store.recordToolkitRefund({
      captureId: order?.captureId ?? '',
      refundId: 'TK-1',
      amountCents: 2000,
    })
    await store.recordToolkitRefund({
      captureId: order?.captureId ?? '',
      refundId: 'TK-1',
      amountCents: 2000,
    })
    await store.recordToolkitRefund({ captureId: order?.captureId ?? '', refundId: 'TK-2' })
    const [after] = await db.select().from(orders).where(eq(orders.id, id))
    expect(after).toMatchObject({ refundedCents: 12400, status: 'refunded' })
  })
})
