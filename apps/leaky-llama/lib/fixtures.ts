import { eq } from 'drizzle-orm'
import type { StoreDb } from './db/client'
import { orders, parseOrderNumber, touch } from './db/schema'

/**
 * Test scaffolding for the demo store: put an order where a scenario needs it. Only the demo
 * store has this, and only behind the probe secret. It never touches PayPal.
 */
export async function ageOrder(db: StoreDb, ref: string, days: number, now = new Date()) {
  const id = parseOrderNumber(ref)
  if (!id || !Number.isInteger(days) || days < 0 || days > 3650) return false
  const createdAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const updated = await db
    .update(orders)
    .set({ createdAt, ...touch() })
    .where(eq(orders.id, id))
    .returning({ id: orders.id })
  return updated.length > 0
}
