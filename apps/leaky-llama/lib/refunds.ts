import { toDecimal } from '@shakedown/core/money'
import { eq } from 'drizzle-orm'
import type { StoreDeps } from './checkout'
import type { StoreDb } from './db/client'
import { orders, refunds, touch } from './db/schema'

type Order = typeof orders.$inferSelect
type Source = (typeof refunds.$inferInsert)['source']

/**
 * Record a refund once (PayPal's refund ID is the key) and bring the order's totals up to date.
 * Lulu's own refunds and PayPal's later notification about the same refund land here, so the
 * order never counts one refund twice.
 */
export async function recordRefund(
  db: StoreDb,
  order: Order,
  refund: { paypalRefundId: string | null; amountCents: number; source: Source; reason?: string },
): Promise<{ refundedCents: number }> {
  const known = refund.paypalRefundId
    ? await db.select().from(refunds).where(eq(refunds.paypalRefundId, refund.paypalRefundId))
    : []
  if (known.length === 0) {
    await db.insert(refunds).values({
      orderId: order.id,
      paypalRefundId: refund.paypalRefundId,
      amountCents: refund.amountCents,
      source: refund.source,
      reason: refund.reason ?? null,
    })
  }
  const all = await db.select().from(refunds).where(eq(refunds.orderId, order.id))
  const refundedCents = all.reduce((sum, row) => sum + row.amountCents, 0)
  await db
    .update(orders)
    .set({
      refundedCents,
      status: refundedCents >= order.capturedCents ? 'refunded' : 'partially_refunded',
      ...touch(),
    })
    .where(eq(orders.id, order.id))
  return { refundedCents }
}

/** Refund through PayPal, then record it. One request ID per refund, so a retry can't pay twice. */
export async function issueRefund(
  deps: StoreDeps,
  order: Order,
  amountCents: number,
  reason: string,
): Promise<{ refundId: string }> {
  if (!order.captureId) throw new Error('This order has no capture to refund.')
  const existing = await deps.db.select().from(refunds).where(eq(refunds.orderId, order.id))
  const refund = await deps.paypal.refundCapture(
    order.captureId,
    { currency_code: order.currency, value: toDecimal(amountCents) },
    `refund-${order.id}-${existing.length + 1}`,
  )
  await recordRefund(deps.db, order, {
    paypalRefundId: refund.id,
    amountCents,
    source: 'support',
    reason,
  })
  return { refundId: refund.id }
}
