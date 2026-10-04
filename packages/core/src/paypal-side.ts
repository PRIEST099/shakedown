import {
  CARD_DECLINE_TRIGGER,
  capturesOf,
  confirmPaymentSource,
  getOrder,
  getRefund,
  PayPalApiError,
  type PayPalSandboxClient,
  sandboxTestCard,
} from '@shakedown/paypal'
import type { Cents } from './money'
import { toCents } from './money'

/**
 * PayPal's half of a checkout, done by the engine rather than the target.
 *
 * `confirmCard` is the step PayPal's card fields perform in a customer's browser: attaching a
 * card to an order the store created. Only PayPal's published sandbox test cards are used.
 * `readOrder` is the ledger: what PayPal actually holds. The grader believes this over anything
 * the target says.
 */

export interface CardConfirmation {
  status: number
  /** PayPal's order status after the card was attached, e.g. APPROVED. */
  orderStatus?: string
  error?: string
}

export interface PayPalCapture {
  id: string
  status: string
  amountCents: Cents
  currency: string
}

export interface PayPalOrderView {
  paypalOrderId: string
  found: boolean
  status: string
  captures: readonly PayPalCapture[]
}

export interface PayPalRefundView {
  refundId: string
  found: boolean
  status: string
  amountCents: Cents
  currency: string
}

export interface PayPalSide {
  confirmCard(paypalOrderId: string, options?: { decline?: boolean }): Promise<CardConfirmation>
  readOrder(paypalOrderId: string): Promise<PayPalOrderView>
  /** A refund, as PayPal holds it. Optional: only the support cast needs it. */
  readRefund?(refundId: string): Promise<PayPalRefundView>
}

/** The real thing, through the sandbox-locked client. */
export function sandboxPayPalSide(client: PayPalSandboxClient): PayPalSide {
  return {
    async confirmCard(paypalOrderId, options) {
      const card = sandboxTestCard(options?.decline ? CARD_DECLINE_TRIGGER : 'Sandbox Customer')
      try {
        const res = await confirmPaymentSource(client, paypalOrderId, card)
        return { status: res.status, orderStatus: res.data.status }
      } catch (error) {
        if (!(error instanceof PayPalApiError)) throw error
        return { status: error.status, error: error.issue ?? error.errorName ?? error.message }
      }
    },

    async readRefund(refundId) {
      try {
        const refund = (await getRefund(client, refundId)).data
        return {
          refundId,
          found: true,
          status: refund.status,
          amountCents: refund.amount ? toCents(refund.amount.value) : 0,
          currency: refund.amount?.currency_code ?? 'USD',
        }
      } catch (error) {
        if (error instanceof PayPalApiError && error.status === 404) {
          return { refundId, found: false, status: 'NOT_FOUND', amountCents: 0, currency: 'USD' }
        }
        throw error
      }
    },

    async readOrder(paypalOrderId) {
      try {
        const order = (await getOrder(client, paypalOrderId)).data
        return {
          paypalOrderId,
          found: true,
          status: order.status,
          captures: capturesOf(order).map((capture) => ({
            id: capture.id,
            status: capture.status,
            amountCents: toCents(capture.amount.value),
            currency: capture.amount.currency_code,
          })),
        }
      } catch (error) {
        if (error instanceof PayPalApiError && error.status === 404) {
          return { paypalOrderId, found: false, status: 'NOT_FOUND', captures: [] }
        }
        throw error
      }
    },
  }
}

/**
 * Captures where money really moved. A refund changes a capture's status from COMPLETED to
 * PARTIALLY_REFUNDED or REFUNDED (SPIKES.md, S5), but the payment still happened.
 */
const PAID = new Set(['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'])

export const paidCaptures = (order: PayPalOrderView | undefined): PayPalCapture[] =>
  order?.captures.filter((capture) => PAID.has(capture.status)) ?? []
