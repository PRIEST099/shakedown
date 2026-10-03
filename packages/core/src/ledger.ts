import type { Cents } from './money'
import type { OrderState, WebhookEvent } from './target'

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
}

/** A persona's own commentary. Recorded for the report, never graded. */
export interface NoteEntry {
  kind: 'note'
  at: string
  detail: string
}

export type LedgerEntry = OrderOpenedEntry | DeliveryEntry | ProbeEntry | NoteEntry

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
    this.#entries.push({ kind: 'order-opened', at: this.#stamp(), ...order })
  }

  delivered(
    event: WebhookEvent,
    outcome: { signed: boolean; status: number; accepted: boolean },
  ): void {
    this.#entries.push({
      kind: 'delivery',
      at: this.#stamp(),
      eventId: event.id,
      eventType: event.event_type,
      createTime: event.create_time,
      orderId: event.resource.custom_id,
      ...outcome,
    })
  }

  probed(state: OrderState): void {
    this.#entries.push({ kind: 'probe', at: this.#stamp(), ...state })
  }

  noted(detail: string): void {
    this.#entries.push({ kind: 'note', at: this.#stamp(), detail })
  }

  view(): LedgerView {
    return new LedgerView(this.#entries)
  }
}
