import type { Cents } from './money'

/**
 * The system under test: the operator's own checkout and webhook listener. Phase 2 drives a
 * fixture built for the purpose; Phase 3 points the same interface at the demo store, and the
 * CLI points it at whatever integration the operator owns.
 */

/** A PayPal-shaped webhook event. Only the fields the engine reads are typed. */
export interface WebhookEvent {
  id: string
  event_type: string
  create_time: string
  resource_type?: string
  resource: {
    id: string
    status?: string
    custom_id?: string
    amount?: { currency_code: string; value: string }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface DeliveryOptions {
  /**
   * Ask the adapter to attach valid proof of origin. False means the listener gets an event
   * it cannot authenticate, which is exactly what it must refuse to act on.
   */
  signed?: boolean
}

export interface DeliveryResult {
  status: number
  /** True when the listener answered 2xx. Says nothing about what it then did. */
  accepted: boolean
  body: string
}

/** What the target believes about an order. Read through its secret-protected probe route. */
export interface OrderState {
  orderId: string
  found: boolean
  /** The target's own word for where the order stands, e.g. 'pending', 'fulfilled', 'refunded'. */
  status: string
  /** How many times the target has released goods for this order. */
  fulfillmentCount: number
  amountCents: Cents
  currency: string
}

export interface OpenedOrder {
  orderId: string
  captureId: string
  amountCents: Cents
  currency: string
}

export interface TargetAdapter {
  readonly name: string
  readonly origin: string
  /**
   * Put the target into a state where an order is awaiting payment. The fixture fakes a
   * checkout; the real adapters walk the operator's own checkout in the PayPal sandbox.
   */
  openOrder(input: { amountCents: Cents; currency?: string }): Promise<OpenedOrder>
  deliverWebhook(event: WebhookEvent, options?: DeliveryOptions): Promise<DeliveryResult>
  probeOrder(orderId: string): Promise<OrderState>
}
