import { desc, eq, inArray, sql } from 'drizzle-orm'
import type { StoreDb } from './db/client'
import { orderNumber, orders, parseOrderNumber, shipments } from './db/schema'
import { probeOrder } from './probe'

export const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  held: 'On hold',
  fulfilled: 'Shipped',
  declined: 'Payment declined',
  partially_refunded: 'Partly refunded',
  refunded: 'Refunded',
  disputed: 'Disputed',
}

/** Show enough of an email to recognise it, not enough to collect it. */
export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@')
  return `${name.slice(0, 1)}•••@${domain}`
}

export async function ordersForVisitor(db: StoreDb, visitorId: string | undefined) {
  if (!visitorId) return []
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.visitorId, visitorId))
    .orderBy(desc(orders.id))
    .limit(50)
  if (rows.length === 0) return []
  const counts = await db
    .select({ orderId: shipments.orderId, count: sql<number>`count(*)::int` })
    .from(shipments)
    .where(
      inArray(
        shipments.orderId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(shipments.orderId)
  const shippedBy = new Map(counts.map((row) => [row.orderId, row.count]))
  return rows.map((row) => ({
    number: orderNumber(row.id),
    status: row.status,
    amountCents: row.amountCents,
    items: row.items,
    createdAt: row.createdAt,
    shipments: shippedBy.get(row.id) ?? 0,
  }))
}

/**
 * A visitor sees their own orders. Orders a Shakedown campaign placed carry only made-up test
 * customers, so anyone can open those, which lets a demo link straight to one.
 */
export async function orderForViewer(db: StoreDb, ref: string, visitorId: string | undefined) {
  const id = parseOrderNumber(ref)
  if (!id) return undefined
  const [order] = await db.select().from(orders).where(eq(orders.id, id))
  if (!order) return undefined
  const mine = Boolean(visitorId) && order.visitorId === visitorId
  if (!mine && !order.campaignId) return undefined
  const detail = await probeOrder(db, orderNumber(order.id))
  return { ...detail, createdAt: order.createdAt, email: maskEmail(order.email) }
}
