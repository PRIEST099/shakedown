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
  /**
   * Whether the delivery really carried valid proof of origin. An adapter that was asked to sign
   * but cannot (only PayPal can sign for a real store) must say so, so the ledger stays true.
   */
  signed?: boolean
}

/** One release of goods, as the target reports it. */
export interface Shipment {
  /** The code path that released the goods, e.g. 'checkout' or 'webhook'. */
  source: string
  /** What the goods are worth at the target's own catalog prices. */
  valueCents: Cents
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
  paypalOrderId?: string | null
  captureId?: string | null
  /** What the target believes was captured. PayPal's ledger is checked separately. */
  capturedCents?: Cents
  shipments?: readonly Shipment[]
  /** What the target's listener did with each delivery for this order, in order, if it says. */
  deliveries?: readonly { eventId: string | null; outcome: string }[]
  /** Refunds the target has recorded for this order. PayPal confirms each one separately. */
  refunds?: readonly { paypalRefundId: string | null; amountCents: Cents; source: string }[]
  /** Requests the target has filed for a person to review, if it keeps such a record. */
  escalations?: readonly { amountCents: Cents; reason: string }[]
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** What the target's support assistant said back. */
export interface SupportReply {
  status: number
  reply?: string
  /** The tools the assistant says it used. Reported, never graded. */
  toolCalls?: readonly { name: string; input?: unknown }[]
  error?: string
}

/** A support assistant the cast can talk to. Each call carries the whole conversation so far. */
export interface SupportPort {
  chat(turns: readonly ChatTurn[]): Promise<SupportReply>
}

/** Demo-store scaffolding for putting an order where a scenario needs it. */
export interface FixturesPort {
  ageOrder(ref: string, days: number): Promise<boolean>
}

/** A line in a cart. A price is only sent when a scenario deliberately sends its own. */
export interface CheckoutLine {
  sku: string
  qty: number
  unitCents?: Cents
}

export interface CatalogItem {
  sku: string
  name: string
  priceCents: Cents
}

/** What the target answered when asked to open a checkout. HTTP failures are answers too. */
export interface CheckoutOpened {
  status: number
  storeOrderId?: string
  paypalOrderId?: string
  amountCents?: Cents
  currency?: string
  /** The target recognised a repeat and handed back the order it already made. */
  reused?: boolean
  error?: string
}

/** What the target told the customer after capturing. */
export interface CaptureAnswer {
  status: number
  /** The target's own verdict, e.g. 'paid', 'held', 'declined'. */
  kind: string
  storeOrderId?: string
  captureId?: string
  shipped?: boolean
  error?: string
}

/** A checkout the cast can walk through, as a customer's browser would. */
export interface CheckoutPort {
  /** What the store sells. */
  readonly catalog: readonly CatalogItem[]
  openCheckout(input: {
    lines: CheckoutLine[]
    email: string
    checkoutKey?: string
  }): Promise<CheckoutOpened>
  /** Ask the target to capture an order the customer has approved. */
  capture(paypalOrderId: string, input?: { lines?: CheckoutLine[] }): Promise<CaptureAnswer>
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
  /** Present when the target has a checkout the cast can walk through. */
  checkout?: CheckoutPort
  /** Present when the target has a support assistant to talk to. */
  support?: SupportPort
  fixtures?: FixturesPort
}
