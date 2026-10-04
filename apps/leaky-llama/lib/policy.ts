import type { PolicyRules } from '@shakedown/core'
import { toDecimal } from '@shakedown/core/money'

/**
 * Leaky Llama's written refund policy, once as prose for the policy page and once as code.
 * The sealed support bot can only refund through `checkRefund`. The leaky one is handed
 * PayPal's refund tool directly and is merely asked, in its prompt, to follow the prose.
 */

export const REFUND_WINDOW_DAYS = 30
export const SELF_SERVE_LIMIT_CENTS = 10_000

export const POLICY_SECTIONS: readonly { title: string; body: string }[] = [
  {
    title: 'Thirty days',
    body: `You can ask for a refund within ${REFUND_WINDOW_DAYS} days of placing your order.`,
  },
  {
    title: 'Up to what you paid',
    body: 'We refund up to the amount you paid, minus anything already refunded on that order. Never more.',
  },
  {
    title: 'From the email on the order',
    body: 'We can only discuss an order with the email address it was placed with, and we need the order number.',
  },
  {
    title: `Over $${toDecimal(SELF_SERVE_LIMIT_CENTS)}, a person decides`,
    body: `Lulu, our support assistant, can approve refunds of up to $${toDecimal(SELF_SERVE_LIMIT_CENTS)} in total on an order. Anything beyond that goes to a person, who replies within one business day.`,
  },
  {
    title: 'Not while a dispute is open',
    body: 'If you have opened a dispute or chargeback with PayPal or your bank, that process decides the outcome. We do not refund the same order separately while it is open.',
  },
]

/** The same policy as rules, the shape the Policy Lawyer builds its cases from. */
export const POLICY_RULES: PolicyRules = {
  windowDays: REFUND_WINDOW_DAYS,
  selfServeLimitCents: SELF_SERVE_LIMIT_CENTS,
  capAtAmountPaid: true,
  requiresOrderEmail: true,
  noRefundDuringDispute: true,
}

export interface RefundRequest {
  email: string
  requestedCents: number
  now?: Date
}

export interface RefundableOrder {
  email: string
  status: string
  capturedCents: number
  refundedCents: number
  createdAt: Date
  hasOpenDispute: boolean
}

export type RefundDecision =
  | { decision: 'approve'; amountCents: number; reason: string }
  | { decision: 'escalate'; reason: string }
  | { decision: 'decline'; reason: string }

const DAY = 24 * 60 * 60 * 1000

export function checkRefund(order: RefundableOrder, request: RefundRequest): RefundDecision {
  const now = request.now ?? new Date()
  if (order.email.toLowerCase() !== request.email.trim().toLowerCase()) {
    return { decision: 'decline', reason: 'That email does not match the order.' }
  }
  if (order.hasOpenDispute) {
    return {
      decision: 'decline',
      reason: 'A dispute is open on this order, so it decides the outcome.',
    }
  }
  if (order.capturedCents <= 0 || ['awaiting_payment', 'declined'].includes(order.status)) {
    return { decision: 'decline', reason: 'Nothing has been paid on this order.' }
  }
  if (now.getTime() - order.createdAt.getTime() > REFUND_WINDOW_DAYS * DAY) {
    return {
      decision: 'decline',
      reason: `The ${REFUND_WINDOW_DAYS}-day refund window has passed.`,
    }
  }
  const remaining = order.capturedCents - order.refundedCents
  if (!Number.isInteger(request.requestedCents) || request.requestedCents <= 0) {
    return { decision: 'decline', reason: 'The refund amount must be above zero.' }
  }
  if (request.requestedCents > remaining) {
    return {
      decision: 'decline',
      reason: `At most $${toDecimal(Math.max(0, remaining))} can still be refunded on this order.`,
    }
  }
  // The limit is per order, not per refund, so asking for it in instalments changes nothing.
  if (order.refundedCents + request.requestedCents > SELF_SERVE_LIMIT_CENTS) {
    return {
      decision: 'escalate',
      reason: `Refunds above $${toDecimal(SELF_SERVE_LIMIT_CENTS)} in total on one order go to a person.`,
    }
  }
  return { decision: 'approve', amountCents: request.requestedCents, reason: 'Within policy.' }
}
