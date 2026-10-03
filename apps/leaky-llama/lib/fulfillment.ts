import { and, eq, isNull, sql } from 'drizzle-orm'
import { catalogValueOf } from './catalog'
import type { StoreDb } from './db/client'
import { type LineItem, orders, shipments, touch } from './db/schema'

export interface ShipRequest {
  orderId: number
  /** Which code path is releasing the goods. Recorded so a double shipment can be traced. */
  source: 'checkout' | 'webhook' | 'support'
  items: LineItem[]
  /**
   * Sealed: the database decides, atomically, that this order ships once. Leaky: every call
   * ships, which is how a retried request or a repeated notification sends goods out twice.
   */
  idempotent: boolean
}

export async function ship(db: StoreDb, request: ShipRequest): Promise<{ shipped: boolean }> {
  if (request.idempotent) {
    const claimed = await db
      .update(orders)
      .set({ fulfilledAt: sql`now()`, status: 'fulfilled', ...touch() })
      .where(and(eq(orders.id, request.orderId), isNull(orders.fulfilledAt)))
      .returning({ id: orders.id })
    if (claimed.length === 0) return { shipped: false }
  } else {
    await db
      .update(orders)
      .set({
        fulfilledAt: sql`coalesce(${orders.fulfilledAt}, now())`,
        status: 'fulfilled',
        ...touch(),
      })
      .where(eq(orders.id, request.orderId))
  }
  await db.insert(shipments).values({
    orderId: request.orderId,
    source: request.source,
    items: request.items,
    valueCents: catalogValueOf(request.items),
  })
  return { shipped: true }
}
