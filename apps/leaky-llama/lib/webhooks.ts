import { allLeaky, type StoreMode } from '@shakedown/core/mode'
import { toCents, toDecimal } from '@shakedown/core/money'
import type { TransmissionHeaders } from '@shakedown/paypal'
import { eq } from 'drizzle-orm'
import type { StoreDeps } from './checkout'
import type { StoreDb } from './db/client'
import {
  disputes,
  orders,
  parseOrderNumber,
  processedEvents,
  touch,
  webhookDeliveries,
} from './db/schema'
import { ship } from './fulfillment'
import { recordRefund } from './refunds'

type Order = typeof orders.$inferSelect
type Outcome = (typeof webhookDeliveries.$inferInsert)['outcome']
type Verification = (typeof webhookDeliveries.$inferInsert)['verification']

interface Money {
  currency_code?: string
  value?: string
}

/** The fields the store reads off an event. Everything else is ignored. */
interface IncomingEvent {
  id: string
  event_type: string
  create_time: string
  resource?: {
    id?: string
    status?: string
    custom_id?: string
    amount?: Money
    supplementary_data?: { related_ids?: { order_id?: string } }
    links?: { rel?: string; href?: string }[]
    dispute_id?: string
    disputed_transactions?: { seller_transaction_id?: string }[]
    dispute_amount?: Money
    reason?: string
  }
}

export interface WebhookInput {
  raw: string
  headers: TransmissionHeaders
  /** From a signed campaign token, when a Shakedown campaign sent this delivery. */
  campaignMode?: StoreMode
}

export interface WebhookResult {
  status: number
  outcome: Outcome
  detail: string
}

function readEvent(raw: string): IncomingEvent | undefined {
  try {
    const event = JSON.parse(raw) as Partial<IncomingEvent>
    if (typeof event.id !== 'string' || typeof event.event_type !== 'string') return undefined
    return { ...event, create_time: String(event.create_time ?? '') } as IncomingEvent
  } catch {
    return undefined
  }
}

const captureIdFromLinks = (event: IncomingEvent) =>
  event.resource?.links
    ?.find((link) => link.rel === 'up')
    ?.href?.match(/\/captures\/([^/?#]+)/)?.[1]

/** Which of our orders an event is about, by whichever reference it carries. */
async function findOrder(db: StoreDb, event: IncomingEvent): Promise<Order | undefined> {
  const resource = event.resource ?? {}
  const byNumber = resource.custom_id ? parseOrderNumber(resource.custom_id) : undefined
  if (byNumber) {
    const [order] = await db.select().from(orders).where(eq(orders.id, byNumber))
    if (order) return order
  }
  const paypalOrderId = resource.supplementary_data?.related_ids?.order_id
  if (paypalOrderId) {
    const [order] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId))
    if (order) return order
  }
  const captureId = event.event_type.startsWith('PAYMENT.CAPTURE.REFUNDED')
    ? captureIdFromLinks(event)
    : event.event_type.startsWith('CUSTOMER.DISPUTE')
      ? resource.disputed_transactions?.[0]?.seller_transaction_id
      : resource.id
  if (captureId) {
    const [order] = await db.select().from(orders).where(eq(orders.captureId, captureId))
    if (order) return order
  }
  return undefined
}

/**
 * The webhook listener.
 *
 * The Echo — sealed verifies every delivery with PayPal against its raw bytes, acts on each
 * event ID once, and ignores events older than the last one applied. Leaky does none of that.
 *
 * The order is looked up before verification only to learn which switches it was placed under.
 * Nothing is acted on until the delivery has passed every check its switches require.
 */
export async function handleWebhook(deps: StoreDeps, input: WebhookInput): Promise<WebhookResult> {
  const { db, paypal } = deps
  const event = readEvent(input.raw)
  const order = event ? await findOrder(db, event) : undefined
  const mode = input.campaignMode ?? order?.mode ?? allLeaky()
  const sealed = mode.echo === 'sealed'

  const record = async (verification: Verification, result: WebhookResult) => {
    await db.insert(webhookDeliveries).values({
      eventId: event?.id ?? null,
      eventType: event?.event_type ?? null,
      createTime: event?.create_time ?? null,
      orderId: order?.id ?? null,
      raw: input.raw,
      headers: { ...input.headers } as Record<string, string | null>,
      verification,
      outcome: result.outcome,
      detail: result.detail,
    })
    return result
  }

  if (!event) {
    return record('skipped', { status: 400, outcome: 'rejected', detail: 'Not a webhook event.' })
  }

  let verification: Verification = 'skipped'
  if (sealed) {
    verification = await paypal.verifyWebhook({ headers: input.headers, rawEvent: input.raw })
    if (verification !== 'SUCCESS') {
      return record(verification, {
        status: 400,
        outcome: 'rejected',
        detail: paypal.canVerify
          ? 'PayPal could not verify the signature.'
          : 'No webhook ID is configured, so nothing can be verified. Refusing.',
      })
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (sealed) {
        const fresh = await tx
          .insert(processedEvents)
          .values({ eventId: event.id })
          .onConflictDoNothing()
          .returning()
        if (fresh.length === 0) {
          return {
            status: 200,
            outcome: 'duplicate',
            detail: `Already processed ${event.id}.`,
          } as const
        }
      }
      if (!order) {
        return {
          status: 200,
          outcome: 'unmatched',
          detail: 'No order matches this event.',
        } as const
      }
      // Re-read inside the transaction so the guard sees the latest state.
      const [current] = await tx.select().from(orders).where(eq(orders.id, order.id))
      if (!current) {
        return { status: 200, outcome: 'unmatched', detail: 'The order is gone.' } as const
      }
      if (sealed && current.lastEventAt && event.create_time < current.lastEventAt) {
        return {
          status: 200,
          outcome: 'stale',
          detail: `Created ${event.create_time}, older than the last event applied (${current.lastEventAt}).`,
        } as const
      }
      return apply(tx as unknown as StoreDb, current, event, mode)
    })
    return record(verification, result)
  } catch (error) {
    await record(verification, {
      status: 500,
      outcome: 'ignored',
      detail: `Failed while applying: ${(error as Error).message}`,
    })
    throw error
  }
}

async function apply(
  db: StoreDb,
  order: Order,
  event: IncomingEvent,
  mode: StoreMode,
): Promise<WebhookResult> {
  const resource = event.resource ?? {}
  const stamp = { lastEventAt: event.create_time, ...touch() }

  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const amountCents = toCents(resource.amount?.value ?? '0')
      const currency = resource.amount?.currency_code ?? order.currency
      await db
        .update(orders)
        .set({ captureId: resource.id ?? order.captureId, capturedCents: amountCents, ...stamp })
        .where(eq(orders.id, order.id))

      if (
        mode['cart-shuffler'] === 'sealed' &&
        (amountCents !== order.amountCents || currency !== order.currency)
      ) {
        await db.update(orders).set({ status: 'held' }).where(eq(orders.id, order.id))
        return {
          status: 200,
          outcome: 'applied',
          detail: `Held: captured ${toDecimal(amountCents)} ${currency} against an order of ${toDecimal(order.amountCents)} ${order.currency}.`,
        }
      }

      const { shipped } = await ship(db, {
        orderId: order.id,
        source: 'webhook',
        items: order.items,
        idempotent: mode['double-clicker'] === 'sealed',
      })
      const [after] = await db.select().from(orders).where(eq(orders.id, order.id))
      await db
        .update(orders)
        .set({ status: after?.fulfilledAt ? 'fulfilled' : 'paid' })
        .where(eq(orders.id, order.id))
      return {
        status: 200,
        outcome: 'applied',
        detail: shipped ? 'Marked paid and shipped.' : 'Marked paid; it had already shipped.',
      }
    }

    case 'PAYMENT.CAPTURE.PENDING': {
      if (order.status === 'awaiting_payment') {
        await db
          .update(orders)
          .set({ status: 'held', ...stamp })
          .where(eq(orders.id, order.id))
      }
      return { status: 200, outcome: 'applied', detail: 'Payment pending at PayPal.' }
    }

    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED': {
      if (!order.fulfilledAt) {
        await db
          .update(orders)
          .set({ status: 'declined', ...stamp })
          .where(eq(orders.id, order.id))
      }
      return { status: 200, outcome: 'applied', detail: 'Payment declined.' }
    }

    case 'PAYMENT.CAPTURE.REFUNDED': {
      const amountCents = toCents(resource.amount?.value ?? '0')
      await recordRefund(db, order, {
        paypalRefundId: resource.id ?? null,
        amountCents,
        source: 'webhook',
        reason: 'Reported by PayPal',
      })
      await db.update(orders).set(stamp).where(eq(orders.id, order.id))
      return {
        status: 200,
        outcome: 'applied',
        detail: `Refund of ${toDecimal(amountCents)} recorded.`,
      }
    }

    case 'CUSTOMER.DISPUTE.CREATED': {
      const disputeId = resource.dispute_id ?? resource.id
      if (!disputeId) return { status: 200, outcome: 'ignored', detail: 'Dispute without an ID.' }
      const disputedCents = toCents(resource.dispute_amount?.value ?? '0')
      const reconciliation = reconcile(order, disputedCents)
      const sealedSecondOpinion = mode['second-opinion'] === 'sealed'
      await db
        .insert(disputes)
        .values({
          id: disputeId,
          orderId: order.id,
          captureId: order.captureId,
          amountCents: disputedCents,
          reason: resource.reason ?? null,
          status: resource.status ?? 'OPEN',
          response: sealedSecondOpinion ? 'held_for_review' : 'none',
          detail: sealedSecondOpinion ? reconciliation : null,
        })
        .onConflictDoNothing()
      await db
        .update(orders)
        .set({ status: 'disputed', ...stamp })
        .where(eq(orders.id, order.id))
      return {
        status: 200,
        outcome: 'applied',
        detail: sealedSecondOpinion ? `Held for review. ${reconciliation}` : 'Dispute recorded.',
      }
    }

    default:
      await db.update(orders).set(stamp).where(eq(orders.id, order.id))
      return { status: 200, outcome: 'ignored', detail: `${event.event_type} is not handled.` }
  }
}

/** The sums a person needs before answering a dispute. */
export function reconcile(order: Order, disputedCents: number): string {
  const paidOut = order.refundedCents + disputedCents
  const over = paidOut - order.capturedCents
  const base = `Captured ${toDecimal(order.capturedCents)}, already refunded ${toDecimal(order.refundedCents)}, disputed ${toDecimal(disputedCents)} ${order.currency}.`
  return over > 0
    ? `${base} Conceding in full would pay out ${toDecimal(paidOut)}, which is ${toDecimal(over)} more than was ever captured. Answer with the refund as evidence.`
    : `${base} Conceding would not exceed what was captured.`
}
