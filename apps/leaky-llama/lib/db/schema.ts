import type { StoreMode } from '@shakedown/core/mode'
import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Leaky Llama's own records. Shakedown never reads these tables directly; it asks the store
 * through the probe API, exactly as it would ask any other integration.
 */

export interface LineItem {
  sku: string
  name: string
  qty: number
  unitCents: number
}

export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'held'
  | 'fulfilled'
  | 'declined'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed'

export const orders = pgTable(
  'orders',
  {
    /** Shown to customers as LL-10001 and up. */
    id: serial('id').primaryKey(),
    paypalOrderId: text('paypal_order_id').unique(),
    /** Set only by a sealed checkout: one key per checkout attempt, so a retry finds its order. */
    checkoutKey: text('checkout_key').unique(),
    email: text('email').notNull(),
    items: jsonb('items').$type<LineItem[]>().notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').$type<OrderStatus>().notNull().default('awaiting_payment'),
    captureId: text('capture_id'),
    capturedCents: integer('captured_cents').notNull().default(0),
    refundedCents: integer('refunded_cents').notNull().default(0),
    /** create_time of the newest webhook event applied, for the sealed ordering guard. */
    lastEventAt: text('last_event_at'),
    /** Set once by sealed fulfilment; a conditional update on it makes shipping happen once. */
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    /** The switches in force when the order was placed. Every later step reads these. */
    mode: jsonb('mode').$type<StoreMode>().notNull(),
    campaignId: text('campaign_id'),
    /** A random cookie value, so a visitor sees their own orders and nobody else's. */
    visitorId: text('visitor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('orders_visitor').on(table.visitorId),
    index('orders_capture').on(table.captureId),
    index('orders_campaign').on(table.campaignId),
  ],
)

/** Every time goods leave the warehouse. Two rows for one order means it shipped twice. */
export const shipments = pgTable(
  'shipments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Which code path released the goods: the checkout route, the webhook listener, or support. */
    source: text('source').$type<'checkout' | 'webhook' | 'support'>().notNull(),
    items: jsonb('items').$type<LineItem[]>().notNull(),
    valueCents: integer('value_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('shipments_order').on(table.orderId)],
)

/**
 * Every delivery to the webhook listener, byte for byte, whatever happened to it. The probe API
 * hands these back so a campaign can quote exactly what arrived.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: serial('id').primaryKey(),
    eventId: text('event_id'),
    eventType: text('event_type'),
    createTime: text('create_time'),
    orderId: integer('order_id'),
    raw: text('raw').notNull(),
    headers: jsonb('headers').$type<Record<string, string | null>>().notNull(),
    verification: text('verification').$type<'SUCCESS' | 'FAILURE' | 'skipped'>().notNull(),
    outcome: text('outcome')
      .$type<'applied' | 'duplicate' | 'stale' | 'rejected' | 'ignored' | 'unmatched'>()
      .notNull(),
    detail: text('detail'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_order').on(table.orderId),
    index('webhook_deliveries_event').on(table.eventId),
  ],
)

/** Event IDs a sealed listener has acted on. The primary key is the deduplication. */
export const processedEvents = pgTable('processed_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const refunds = pgTable(
  'refunds',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    paypalRefundId: text('paypal_refund_id'),
    amountCents: integer('amount_cents').notNull(),
    /** Who issued it: Lulu the support bot, or a PayPal notification about one issued elsewhere. */
    source: text('source').$type<'support' | 'webhook' | 'dispute'>().notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('refunds_order').on(table.orderId)],
)

export const disputes = pgTable(
  'disputes',
  {
    /** PayPal's dispute ID. */
    id: text('id').primaryKey(),
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    captureId: text('capture_id'),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason'),
    status: text('status').notNull(),
    /** What the store did about it, and the numbers it used to decide. */
    response: text('response').$type<'conceded' | 'held_for_review' | 'none'>().notNull(),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('disputes_order').on(table.orderId)],
)

export const schema = {
  orders,
  shipments,
  webhookDeliveries,
  processedEvents,
  refunds,
  disputes,
}

/** LL-10001 for order 1. */
export const orderNumber = (id: number) => `LL-${10000 + id}`

/** Accepts "LL-10042", "10042" or a raw row id. */
export function parseOrderNumber(input: string): number | undefined {
  const digits = /^(?:LL-)?(\d+)$/i.exec(input.trim())?.[1]
  if (!digits) return undefined
  const value = Number(digits)
  const id = value > 10000 ? value - 10000 : value
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

export const touch = () => ({ updatedAt: sql`now()` })
