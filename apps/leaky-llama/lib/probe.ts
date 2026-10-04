import { createHash, timingSafeEqual } from 'node:crypto'
import { asc, desc, eq } from 'drizzle-orm'
import type { StoreDb } from './db/client'
import {
  disputes,
  escalations,
  orderNumber,
  orders,
  parseOrderNumber,
  refunds,
  shipments,
  webhookDeliveries,
} from './db/schema'

/**
 * The read-only probe API Shakedown uses to ask what the store believes. It is protected by a
 * secret the operator shares between Shakedown and their own store, and it never writes.
 */

export const PROBE_HEADER = 'x-shakedown-probe'

export function probeAuthorized(request: Request): boolean {
  const secret = process.env.SHAKEDOWN_PROBE_SECRET
  const given = request.headers.get(PROBE_HEADER)
  if (!secret || !given) return false
  // Hash first so the comparison is constant-time whatever the lengths.
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(secret), digest(given))
}

async function findOrder(db: StoreDb, ref: string) {
  const id = parseOrderNumber(ref)
  if (id) {
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    if (order) return order
  }
  const [byPayPal] = await db.select().from(orders).where(eq(orders.paypalOrderId, ref))
  return byPayPal
}

export async function probeOrder(db: StoreDb, ref: string) {
  const order = await findOrder(db, ref)
  if (!order) {
    return {
      orderId: ref,
      found: false,
      status: 'unknown',
      fulfillmentCount: 0,
      amountCents: 0,
      currency: 'USD',
    }
  }
  const [shipped, refunded, disputed, delivered, escalated] = await Promise.all([
    db.select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(asc(shipments.id)),
    db.select().from(refunds).where(eq(refunds.orderId, order.id)).orderBy(asc(refunds.id)),
    db.select().from(disputes).where(eq(disputes.orderId, order.id)),
    db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.orderId, order.id))
      .orderBy(asc(webhookDeliveries.id)),
    db
      .select()
      .from(escalations)
      .where(eq(escalations.orderId, order.id))
      .orderBy(asc(escalations.id)),
  ])
  return {
    orderId: orderNumber(order.id),
    found: true,
    status: order.status,
    fulfillmentCount: shipped.length,
    amountCents: order.amountCents,
    currency: order.currency,
    paypalOrderId: order.paypalOrderId,
    captureId: order.captureId,
    capturedCents: order.capturedCents,
    refundedCents: order.refundedCents,
    items: order.items,
    campaignId: order.campaignId,
    mode: order.mode,
    shipments: shipped.map((row) => ({
      id: row.id,
      source: row.source,
      valueCents: row.valueCents,
      items: row.items,
      at: row.createdAt.toISOString(),
    })),
    refunds: refunded.map((row) => ({
      paypalRefundId: row.paypalRefundId,
      amountCents: row.amountCents,
      source: row.source,
      at: row.createdAt.toISOString(),
    })),
    escalations: escalated.map((row) => ({
      amountCents: row.amountCents,
      reason: row.reason,
      at: row.createdAt.toISOString(),
    })),
    disputes: disputed.map((row) => ({
      id: row.id,
      amountCents: row.amountCents,
      status: row.status,
      response: row.response,
      detail: row.detail,
    })),
    webhooks: delivered.map((row) => ({
      deliveryId: row.id,
      eventId: row.eventId,
      eventType: row.eventType,
      createTime: row.createTime,
      verification: row.verification,
      outcome: row.outcome,
      detail: row.detail,
      receivedAt: row.receivedAt.toISOString(),
    })),
  }
}

/** Raw deliveries, byte for byte with their transmission headers, newest first. */
export async function probeDeliveries(db: StoreDb, ref: string) {
  const order = await findOrder(db, ref)
  if (!order) return []
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.orderId, order.id))
    .orderBy(desc(webhookDeliveries.id))
  return rows.map((row) => ({
    deliveryId: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    raw: row.raw,
    headers: row.headers,
    verification: row.verification,
    outcome: row.outcome,
  }))
}
