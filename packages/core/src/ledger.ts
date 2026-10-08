import type { Cents } from './money'
import type { PayPalCapture, PayPalRefundView } from './paypal-side'
import type { CheckoutLine, OrderState, Shipment, WebhookEvent } from './target'

/**
 * The ledger is the engine's system of record. Only the engine writes to it: a persona can ask
 * the target to do something, but it cannot say what happened. The grader reads nothing else,
 * so a finding is always traceable to an exchange that really took place.
 */

export interface OrderOpenedEntry {
  kind: 'order-opened'
  at: string
  orderId: string
  captureId: string
  amountCents: Cents
  currency: string
}

export interface DeliveryEntry {
  kind: 'delivery'
  at: string
  eventId: string
  eventType: string
  createTime: string
  /** Whether the engine attached valid proof of origin to this delivery. */
  signed: boolean
  orderId?: string
  status: number
  accepted: boolean
}

export interface ProbeEntry {
  kind: 'probe'
  at: string
  orderId: string
  found: boolean
  status: string
  fulfillmentCount: number
  amountCents: Cents
  currency: string
  paypalOrderId?: string | null
  captureId?: string | null
  capturedCents?: Cents
  shipments?: readonly Shipment[]
  deliveries?: readonly { eventId: string | null; outcome: string }[]
  refunds?: readonly { paypalRefundId: string | null; amountCents: Cents; source: string }[]
  escalations?: readonly { amountCents: Cents; reason: string }[]
}

/** One customer message to the target's support assistant, and its reply. */
export interface ChatEntry {
  kind: 'chat'
  at: string
  customer: string
  status: number
  reply: string
  toolCalls?: readonly string[]
  error?: string
}

/** Demo-store scaffolding the engine used to set a scenario up. */
export interface FixtureEntry {
  kind: 'fixture'
  at: string
  action: 'age-order'
  ref: string
  days: number
  ok: boolean
}

/** A refund as PayPal's ledger holds it. */
export interface PayPalRefundEntry extends PayPalRefundView {
  kind: 'paypal-refund'
  at: string
}

/** The customer asked the target to open a checkout, and this is what came back. */
export interface CheckoutEntry {
  kind: 'checkout'
  at: string
  email: string
  lines: CheckoutLine[]
  /** The cart at the catalog's own prices, whatever prices the customer sent. */
  listCents?: Cents
  checkoutKey?: string
  status: number
  storeOrderId?: string
  paypalOrderId?: string
  amountCents?: Cents
  currency?: string
  reused?: boolean
  error?: string
}

/** The customer's card step at PayPal. */
export interface CardEntry {
  kind: 'card'
  at: string
  paypalOrderId: string
  /** A card the sandbox is set up to decline. */
  decline: boolean
  status: number
  orderStatus?: string
  error?: string
}

/** The target's answer to a capture request. */
export interface CaptureEntry {
  kind: 'capture'
  at: string
  paypalOrderId: string
  /** The cart the customer's browser sent along, if any. */
  lines?: CheckoutLine[]
  status: number
  answer: string
  storeOrderId?: string
  captureId?: string
  shipped?: boolean
  error?: string
}

/** What PayPal's ledger holds for an order: the grader's source of truth. */
export interface PayPalOrderEntry {
  kind: 'paypal-order'
  at: string
  paypalOrderId: string
  found: boolean
  status: string
  captures: readonly PayPalCapture[]
}

/** A persona's own commentary. Recorded for the report, never graded. */
export interface NoteEntry {
  kind: 'note'
  at: string
  detail: string
}

export type LedgerEntry =
  | OrderOpenedEntry
  | DeliveryEntry
  | ProbeEntry
  | CheckoutEntry
  | CardEntry
  | CaptureEntry
  | PayPalOrderEntry
  | ChatEntry
  | FixtureEntry
  | PayPalRefundEntry
  | NoteEntry

/** A frozen snapshot handed to the grader. Query only; nothing here can mutate the run. */
export class LedgerView {
  readonly entries: readonly LedgerEntry[]

  constructor(entries: readonly LedgerEntry[]) {
    this.entries = Object.freeze([...entries])
  }

  orders(): readonly OrderOpenedEntry[] {
    return this.entries.filter((entry) => entry.kind === 'order-opened')
  }

  /** The order this scenario opened. Scenarios open exactly one. */
  order(): OrderOpenedEntry | undefined {
    return this.orders()[0]
  }

  deliveries(predicate?: (entry: DeliveryEntry) => boolean): readonly DeliveryEntry[] {
    const all = this.entries.filter((entry) => entry.kind === 'delivery')
    return predicate ? all.filter(predicate) : all
  }

  probes(orderId?: string): readonly ProbeEntry[] {
    const all = this.entries.filter((entry) => entry.kind === 'probe')
    return orderId ? all.filter((entry) => entry.orderId === orderId) : all
  }

  /** What the target believed last. The grader's main witness. */
  lastProbe(orderId?: string): ProbeEntry | undefined {
    const probes = this.probes(orderId)
    return probes[probes.length - 1]
  }

  checkouts(): readonly CheckoutEntry[] {
    return this.entries.filter((entry) => entry.kind === 'checkout')
  }

  cards(): readonly CardEntry[] {
    return this.entries.filter((entry) => entry.kind === 'card')
  }

  captures(paypalOrderId?: string): readonly CaptureEntry[] {
    const all = this.entries.filter((entry) => entry.kind === 'capture')
    return paypalOrderId ? all.filter((entry) => entry.paypalOrderId === paypalOrderId) : all
  }

  /** PayPal's latest word on an order. */
  paypalOrder(paypalOrderId: string): PayPalOrderEntry | undefined {
    const reads = this.entries.filter(
      (entry): entry is PayPalOrderEntry =>
        entry.kind === 'paypal-order' && entry.paypalOrderId === paypalOrderId,
    )
    return reads[reads.length - 1]
  }

  chats(): readonly ChatEntry[] {
    return this.entries.filter((entry) => entry.kind === 'chat')
  }

  fixtures(): readonly FixtureEntry[] {
    return this.entries.filter((entry) => entry.kind === 'fixture')
  }

  /** PayPal's latest word on each refund it was asked about. */
  paypalRefunds(): PayPalRefundEntry[] {
    const latest = new Map<string, PayPalRefundEntry>()
    for (const entry of this.entries) {
      if (entry.kind === 'paypal-refund') latest.set(entry.refundId, entry)
    }
    return [...latest.values()]
  }

  /** The distinct PayPal orders the target opened during this scenario, in order. */
  paypalOrderIds(): string[] {
    return [
      ...new Set(
        this.checkouts()
          .map((entry) => entry.paypalOrderId)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
  }
}

export class Ledger {
  readonly #entries: LedgerEntry[] = []
  readonly #now: () => Date

  constructor(now: () => Date = () => new Date()) {
    this.#now = now
  }

  get size(): number {
    return this.#entries.length
  }

  #stamp(): string {
    return this.#now().toISOString()
  }

  orderOpened(order: {
    orderId: string
    captureId: string
    amountCents: Cents
    currency: string
  }): void {
    this.#entries.push({ ...order, kind: 'order-opened', at: this.#stamp() })
  }

  delivered(
    event: WebhookEvent,
    outcome: { signed: boolean; status: number; accepted: boolean },
  ): void {
    this.#entries.push({
      ...outcome,
      kind: 'delivery',
      at: this.#stamp(),
      eventId: event.id,
      eventType: event.event_type,
      createTime: event.create_time,
      orderId: event.resource.custom_id,
    })
  }

  probed(state: OrderState): void {
    this.#entries.push({
      ...state,
      kind: 'probe',
      at: this.#stamp(),
      shipments: state.shipments?.map((shipment) => ({
        source: shipment.source,
        valueCents: shipment.valueCents,
      })),
      deliveries: state.deliveries?.map((delivery) => ({
        eventId: delivery.eventId,
        outcome: delivery.outcome,
      })),
      refunds: state.refunds?.map((refund) => ({
        paypalRefundId: refund.paypalRefundId,
        amountCents: refund.amountCents,
        source: refund.source,
      })),
      escalations: state.escalations?.map((escalation) => ({
        amountCents: escalation.amountCents,
        reason: escalation.reason,
      })),
    })
  }

  checkoutOpened(entry: Omit<CheckoutEntry, 'kind' | 'at'>): void {
    this.#entries.push({ ...entry, kind: 'checkout', at: this.#stamp() })
  }

  cardConfirmed(entry: Omit<CardEntry, 'kind' | 'at'>): void {
    this.#entries.push({ ...entry, kind: 'card', at: this.#stamp() })
  }

  captureAnswered(entry: Omit<CaptureEntry, 'kind' | 'at'>): void {
    this.#entries.push({ ...entry, kind: 'capture', at: this.#stamp() })
  }

  paypalRead(entry: Omit<PayPalOrderEntry, 'kind' | 'at'>): void {
    this.#entries.push({ ...entry, kind: 'paypal-order', at: this.#stamp() })
  }

  chatted(entry: Omit<ChatEntry, 'kind' | 'at'>): void {
    this.#entries.push({ ...entry, kind: 'chat', at: this.#stamp() })
  }

  fixtureUsed(entry: Omit<FixtureEntry, 'kind' | 'at'>): void {
    this.#entries.push({ ...entry, kind: 'fixture', at: this.#stamp() })
  }

  paypalRefundRead(entry: PayPalRefundView): void {
    this.#entries.push({ ...entry, kind: 'paypal-refund', at: this.#stamp() })
  }

  noted(detail: string): void {
    this.#entries.push({ kind: 'note', at: this.#stamp(), detail })
  }

  view(): LedgerView {
    return new LedgerView(this.#entries)
  }
}
