import { toCents } from '@shakedown/core/money'
import { type Order, PayPalApiError, type Refund } from '@shakedown/paypal'
import type { PayPalPort } from '../paypal'

/**
 * An in-memory stand-in for the PayPal sandbox, faithful to what Phase 1 measured there:
 * request IDs replay the original response, a second capture is ORDER_ALREADY_CAPTURED, and a
 * declined card can leave the order COMPLETED with the capture DECLINED.
 */
export type CaptureBehaviour =
  | 'complete'
  | 'decline-inside-completed-order'
  | 'decline-error'
  | 'pending'

interface FakeOrder {
  id: string
  amount: { currency_code: string; value: string }
  customId?: string
  captured?: Order
  behaviour: CaptureBehaviour
  captureAmountOverride?: string
}

// Shared across instances: tests share one database, and PayPal IDs are globally unique.
let sequence = 0
const nextId = () => {
  sequence += 1
  return sequence
}

/** Start fake IDs again from 1, so a campaign on a fresh database repeats exactly. */
export const resetFakeIds = () => {
  sequence = 0
}

export class FakePayPal implements PayPalPort {
  canVerify = true
  readonly orders = new Map<string, FakeOrder>()
  readonly calls: { method: string; requestId?: string }[] = []
  /** Refunds issued, by ID, so a test can read them back like PayPal's ledger. */
  readonly refunds = new Map<
    string,
    { id: string; captureId: string; status: string; value: string }
  >()
  readonly #replays = new Map<string, unknown>()
  /** Next order's capture behaviour. */
  nextBehaviour: CaptureBehaviour = 'complete'

  #replay<T>(requestId: string | undefined, run: () => T): T {
    if (requestId && this.#replays.has(requestId)) return this.#replays.get(requestId) as T
    const result = run()
    if (requestId) this.#replays.set(requestId, result)
    return result
  }

  async createOrder(body: Record<string, unknown>, requestId?: string): Promise<Order> {
    this.calls.push({ method: 'createOrder', requestId })
    return this.#replay(requestId, () => {
      const unit = (
        body.purchase_units as Array<{ amount: FakeOrder['amount']; custom_id?: string }>
      )[0]
      if (!unit) throw new Error('no purchase unit')
      const order: FakeOrder = {
        id: `PP-ORDER-${nextId()}`,
        amount: { currency_code: unit.amount.currency_code, value: unit.amount.value },
        customId: unit.custom_id,
        behaviour: this.nextBehaviour,
      }
      this.orders.set(order.id, order)
      return { id: order.id, status: 'CREATED' }
    })
  }

  async captureOrder(paypalOrderId: string, requestId?: string): Promise<Order> {
    this.calls.push({ method: 'captureOrder', requestId })
    if (requestId && this.#replays.has(requestId)) return this.#replays.get(requestId) as Order
    const order = this.orders.get(paypalOrderId)
    if (!order)
      throw new PayPalApiError({ status: 404, message: 'not found', issue: 'INVALID_RESOURCE_ID' })
    if (order.captured) {
      throw new PayPalApiError({
        status: 422,
        message: 'Order already captured',
        issue: 'ORDER_ALREADY_CAPTURED',
      })
    }
    if (order.behaviour === 'decline-error') {
      throw new PayPalApiError({ status: 422, message: 'Declined', issue: 'INSTRUMENT_DECLINED' })
    }
    const captureStatus =
      order.behaviour === 'decline-inside-completed-order'
        ? 'DECLINED'
        : order.behaviour === 'pending'
          ? 'PENDING'
          : 'COMPLETED'
    const captured: Order = {
      id: order.id,
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: `CAP-${order.id}`,
                status: captureStatus,
                amount: {
                  currency_code: order.amount.currency_code,
                  value: order.captureAmountOverride ?? order.amount.value,
                },
              },
            ],
          },
        },
      ],
    }
    order.captured = captured
    if (requestId) this.#replays.set(requestId, captured)
    return captured
  }

  async getOrder(paypalOrderId: string): Promise<Order> {
    const order = this.orders.get(paypalOrderId)
    if (!order) throw new PayPalApiError({ status: 404, message: 'not found' })
    return order.captured ?? { id: order.id, status: 'APPROVED' }
  }

  async refundCapture(
    captureId: string,
    amount: { currency_code: string; value: string },
    requestId?: string,
  ): Promise<Refund> {
    this.calls.push({ method: 'refundCapture', requestId })
    if (requestId && this.#replays.has(requestId)) return this.#replays.get(requestId) as Refund
    // PayPal caps refunds at what is left of the capture (S5: REFUND_AMOUNT_EXCEEDED).
    const captured = this.capturedCents(captureId)
    if (captured !== undefined) {
      const refunded = [...this.refunds.values()]
        .filter((refund) => refund.captureId === captureId)
        .reduce((sum, refund) => sum + toCents(refund.value), 0)
      if (refunded + toCents(amount.value) > captured) {
        throw new PayPalApiError({
          status: 422,
          message: 'Refund amount exceeded',
          issue: 'REFUND_AMOUNT_EXCEEDED',
        })
      }
    }
    return this.#replay(requestId, () => {
      const id = `REFUND-${nextId()}`
      this.refunds.set(id, { id, captureId, status: 'COMPLETED', value: amount.value })
      this.#markRefunded(captureId)
      return {
        id,
        status: 'COMPLETED',
        amount,
        links: [{ rel: 'up', href: `/v2/payments/captures/${captureId}` }],
      }
    })
  }

  /** What a capture took, in cents, if this fake made it and money moved. */
  capturedCents(captureId: string): number | undefined {
    for (const order of this.orders.values()) {
      const capture = order.captured?.purchase_units?.[0]?.payments?.captures?.[0]
      if (
        capture?.id === captureId &&
        capture.status !== 'DECLINED' &&
        capture.status !== 'PENDING'
      ) {
        return toCents(capture.amount.value)
      }
    }
    return undefined
  }

  /** As the sandbox does: a refunded capture becomes PARTIALLY_REFUNDED, then REFUNDED. */
  #markRefunded(captureId: string) {
    for (const order of this.orders.values()) {
      const capture = order.captured?.purchase_units?.[0]?.payments?.captures?.[0]
      if (capture?.id !== captureId) continue
      const refunded = [...this.refunds.values()]
        .filter((refund) => refund.captureId === captureId)
        .reduce((sum, refund) => sum + toCents(refund.value), 0)
      capture.status = refunded >= toCents(capture.amount.value) ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    }
  }

  /** Only deliveries carrying the fake's valid signature verify. */
  async verifyWebhook(input: { headers: Record<string, string | null | undefined> }) {
    this.calls.push({ method: 'verifyWebhook' })
    if (!this.canVerify) return 'FAILURE' as const
    return input.headers['paypal-transmission-sig'] === 'valid-signature'
      ? ('SUCCESS' as const)
      : ('FAILURE' as const)
  }
}

export const signedHeaders = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT',
  'paypal-transmission-id': 'tx',
  'paypal-transmission-sig': 'valid-signature',
  'paypal-transmission-time': '2026-10-03T00:00:00Z',
}

export const unsignedHeaders = { ...signedHeaders, 'paypal-transmission-sig': 'made-up' }
