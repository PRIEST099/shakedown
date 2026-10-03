import type { Cents } from './money'
import { toDecimal } from './money'
import type { WebhookEvent } from './target'

/**
 * Builders for the PayPal-shaped events a listener has to cope with. The engine only ever
 * sends these to a target the operator owns; PayPal itself is never asked to emit them.
 */

export interface EventInput {
  id: string
  orderId: string
  captureId: string
  amountCents: Cents
  currency?: string
  createTime: Date
}

function base(input: EventInput, eventType: string, status: string): WebhookEvent {
  const currency = input.currency ?? 'USD'
  return {
    id: input.id,
    event_version: '1.0',
    create_time: input.createTime.toISOString(),
    resource_type: 'capture',
    resource_version: '2.0',
    event_type: eventType,
    summary: `Payment ${status.toLowerCase()} for ${toDecimal(input.amountCents)} ${currency}`,
    resource: {
      id: input.captureId,
      status,
      custom_id: input.orderId,
      amount: { currency_code: currency, value: toDecimal(input.amountCents) },
    },
  }
}

export const captureCompleted = (input: EventInput): WebhookEvent =>
  base(input, 'PAYMENT.CAPTURE.COMPLETED', 'COMPLETED')

export const captureRefunded = (input: EventInput): WebhookEvent =>
  base(input, 'PAYMENT.CAPTURE.REFUNDED', 'REFUNDED')

export const captureDenied = (input: EventInput): WebhookEvent =>
  base(input, 'PAYMENT.CAPTURE.DENIED', 'DECLINED')
