import type { StoreMode } from '@shakedown/core/mode'
import { toCents, toDecimal } from '@shakedown/core/money'
import { capturesOf, type Order, PayPalApiError } from '@shakedown/paypal'
import { eq } from 'drizzle-orm'
import { CartError, type CartLine, priceCart, totalOf } from './catalog'
import type { StoreDb } from './db/client'
import { orderNumber, orders, touch } from './db/schema'
import { ship } from './fulfillment'
import type { PayPalPort } from './paypal'

export interface StoreDeps {
  db: StoreDb
  paypal: PayPalPort
}

export interface CreateCheckoutInput {
  lines: CartLine[]
  email: string
  /** One per checkout attempt, minted by the browser. Only a sealed checkout uses it. */
  checkoutKey?: string
  mode: StoreMode
  campaignId?: string
  visitorId?: string
}

export interface CreatedCheckout {
  orderNumber: string
  paypalOrderId: string
  amountCents: number
  currency: string
  /** True when a sealed checkout recognised a retry and returned the order it already made. */
  reused: boolean
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Price the cart and open a PayPal order for it.
 *
 * Cart Shuffler — leaky trusts prices the browser sent; sealed prices from the catalog.
 * Double-Clicker — leaky opens a new order on every submit; sealed keys the checkout so a
 * double submit or a retry returns the same order, at our end and at PayPal's.
 */
export async function createCheckout(
  deps: StoreDeps,
  input: CreateCheckoutInput,
): Promise<CreatedCheckout> {
  const { db, paypal } = deps
  const email = input.email.trim().toLowerCase()
  if (!EMAIL.test(email)) throw new CartError('Enter a valid email address.')

  const items = priceCart(input.lines, {
    trustClientPrices: input.mode['cart-shuffler'] === 'leaky',
  })
  const amountCents = totalOf(items)
  if (amountCents <= 0) throw new CartError('The order total must be above zero.')

  const keyed = input.mode['double-clicker'] === 'sealed' && Boolean(input.checkoutKey)
  const checkoutKey = keyed ? (input.checkoutKey as string) : null

  if (checkoutKey) {
    const [existing] = await db.select().from(orders).where(eq(orders.checkoutKey, checkoutKey))
    if (existing?.paypalOrderId) {
      return {
        orderNumber: orderNumber(existing.id),
        paypalOrderId: existing.paypalOrderId,
        amountCents: existing.amountCents,
        currency: existing.currency,
        reused: true,
      }
    }
  }

  const [inserted] = await db
    .insert(orders)
    .values({
      email,
      items,
      amountCents,
      currency: 'USD',
      mode: input.mode,
      campaignId: input.campaignId ?? null,
      visitorId: input.visitorId ?? null,
      checkoutKey,
    })
    .onConflictDoNothing({ target: orders.checkoutKey })
    .returning()
  // A concurrent submit with the same key got there first; share its order.
  const row =
    inserted ??
    (checkoutKey
      ? (await db.select().from(orders).where(eq(orders.checkoutKey, checkoutKey)))[0]
      : undefined)
  if (!row) throw new Error('Could not record the order.')

  const number = orderNumber(row.id)
  const value = (cents: number) => ({ currency_code: row.currency, value: toDecimal(cents) })
  const createAtPayPal = () =>
    paypal.createOrder(
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: number,
            custom_id: number,
            description: 'Leaky Llama Supply Co. (demo store, PayPal sandbox)',
            amount: {
              ...value(row.amountCents),
              breakdown: { item_total: value(row.amountCents) },
            },
            items: row.items.map((item) => ({
              name: item.name,
              sku: item.sku,
              quantity: String(item.qty),
              unit_amount: value(item.unitCents),
            })),
          },
        ],
      },
      checkoutKey ? `create-${checkoutKey}` : undefined,
    )

  let created: Order
  try {
    created = await createAtPayPal()
  } catch (error) {
    // Two submits with one key reach PayPal at once; PayPal may refuse the second while the
    // first is still in flight. The first one's order is the answer to both.
    const settled = checkoutKey ? await waitForOrder(db, row.id) : undefined
    if (!settled) throw error
    return {
      orderNumber: number,
      paypalOrderId: settled,
      amountCents: row.amountCents,
      currency: row.currency,
      reused: true,
    }
  }

  await db
    .update(orders)
    .set({ paypalOrderId: created.id, ...touch() })
    .where(eq(orders.id, row.id))

  return {
    orderNumber: number,
    paypalOrderId: created.id,
    amountCents: row.amountCents,
    currency: row.currency,
    reused: !inserted,
  }
}

/** Poll briefly for the PayPal order a concurrent submit is creating for the same row. */
async function waitForOrder(db: StoreDb, id: number, attempts = 30): Promise<string | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const [row] = await db.select().from(orders).where(eq(orders.id, id))
    if (row?.paypalOrderId) return row.paypalOrderId
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return undefined
}

export type CaptureOutcome =
  | { kind: 'paid'; orderNumber: string; captureId: string; shipped: boolean }
  | { kind: 'held'; orderNumber: string; reason: string }
  | { kind: 'declined'; orderNumber: string; reason: string }
  | { kind: 'not_found' }

export interface CaptureInput {
  paypalOrderId: string
  /** The cart as the browser has it now. Only a leaky Cart Shuffler switch looks at it. */
  clientLines?: CartLine[]
}

/**
 * Capture the payment and, if it really went through, ship.
 *
 * Bouncer — leaky believes the order status; sealed believes the capture status, because a
 * declined card can leave the order COMPLETED with the capture DECLINED.
 * Cart Shuffler — leaky ships whatever the browser's cart says now; sealed ships the order as
 * priced, and only when the captured amount and currency match it.
 * Double-Clicker — sealed reuses one PayPal-Request-Id per capture and ships once; leaky treats
 * "already captured" as a fresh success and ships again.
 */
export async function captureCheckout(
  deps: StoreDeps,
  input: CaptureInput,
): Promise<CaptureOutcome> {
  const { db, paypal } = deps
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paypalOrderId, input.paypalOrderId))
  if (!order?.paypalOrderId) return { kind: 'not_found' }
  const number = orderNumber(order.id)
  const mode = order.mode
  const sealedRetries = mode['double-clicker'] === 'sealed'

  let captured: Order | undefined
  try {
    captured = await paypal.captureOrder(
      order.paypalOrderId,
      sealedRetries ? `capture-${order.paypalOrderId}` : undefined,
    )
  } catch (error) {
    if (!(error instanceof PayPalApiError)) throw error
    if (error.issue === 'INSTRUMENT_DECLINED') {
      await db
        .update(orders)
        .set({ status: 'declined', ...touch() })
        .where(eq(orders.id, order.id))
      return { kind: 'declined', orderNumber: number, reason: 'The card was declined.' }
    }
    if (error.issue !== 'ORDER_ALREADY_CAPTURED') throw error
    if (!sealedRetries) {
      // The leaky habit: "it's already captured, so it's paid", then ship as if for the first time.
      const { shipped } = await ship(db, {
        orderId: order.id,
        source: 'checkout',
        items: order.items,
        idempotent: false,
      })
      return { kind: 'paid', orderNumber: number, captureId: order.captureId ?? '', shipped }
    }
    // Sealed: read what PayPal actually holds and carry on from there.
    captured = await paypal.getOrder(order.paypalOrderId)
  }
  if (!captured) throw new Error('PayPal returned no order.')

  const capture = capturesOf(captured)[0]
  const paid =
    mode.bouncer === 'sealed' ? capture?.status === 'COMPLETED' : captured.status === 'COMPLETED'

  if (!paid || !capture) {
    if (capture?.status === 'PENDING') {
      await db
        .update(orders)
        .set({ status: 'held', captureId: capture.id, ...touch() })
        .where(eq(orders.id, order.id))
      return {
        kind: 'held',
        orderNumber: number,
        reason: 'PayPal is still processing the payment.',
      }
    }
    await db
      .update(orders)
      .set({ status: 'declined', captureId: capture?.id ?? null, ...touch() })
      .where(eq(orders.id, order.id))
    return { kind: 'declined', orderNumber: number, reason: 'The payment did not go through.' }
  }

  const capturedCents = toCents(capture.amount.value)
  await db
    .update(orders)
    .set({ status: 'paid', captureId: capture.id, capturedCents, ...touch() })
    .where(eq(orders.id, order.id))

  let items = order.items
  if (mode['cart-shuffler'] === 'sealed') {
    if (capturedCents !== order.amountCents || capture.amount.currency_code !== order.currency) {
      await db
        .update(orders)
        .set({ status: 'held', ...touch() })
        .where(eq(orders.id, order.id))
      return {
        kind: 'held',
        orderNumber: number,
        reason: `Captured ${capture.amount.value} ${capture.amount.currency_code}, but the order is ${toDecimal(order.amountCents)} ${order.currency}. Held for a person to check.`,
      }
    }
  } else if (input.clientLines?.length) {
    items = priceCart(input.clientLines, { trustClientPrices: true })
  }

  const { shipped } = await ship(db, {
    orderId: order.id,
    source: 'checkout',
    items,
    idempotent: sealedRetries,
  })
  return { kind: 'paid', orderNumber: number, captureId: capture.id, shipped }
}
