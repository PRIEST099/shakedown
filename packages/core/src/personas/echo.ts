import type { Invariant } from '../grader'
import { evidence } from '../grader'
import { toDecimal } from '../money'
import type { PersonaModule, Scenario, ScenarioContext } from '../persona'
import { captureCompleted, captureRefunded } from '../webhook'

/**
 * The Echo — webhook integrity.
 *
 * "Says 'paid' twice, late, out of order, and unsigned."
 *
 * Three properties a listener has to hold, one scenario each. Every event goes to the
 * operator's own listener; none of this involves PayPal's production systems, and nothing
 * here moves real money.
 */

const AMOUNTS = [3600, 4200, 8950, 12400]

const times = (count: number) => (count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`)

/** Scenario 1 — an event the listener cannot authenticate must not move the order. */
const unsignedIgnored: Invariant = {
  id: 'echo.unsigned-event-ignored',
  persona: 'echo',
  title: 'An unverified webhook never releases goods',
  severity: 'high',
  fix: 'Call verify-webhook-signature against the raw request body before you parse it, and return 400 when it does not come back SUCCESS.',
  evaluate(view) {
    const order = view.order()
    const unsigned = view.deliveries((entry) => !entry.signed)
    const probe = view.lastProbe(order?.orderId)
    if (!order || unsigned.length === 0 || !probe?.found) {
      return { verdict: 'inconclusive', detail: 'No unverified delivery and probe pair to judge.' }
    }
    const first = unsigned[0]
    const facts = [
      evidence('Event ID', first?.eventId ?? 'unknown'),
      evidence('Event type', first?.eventType ?? 'unknown'),
      evidence('Signature attached', 'none'),
      evidence('Listener answered', String(first?.status ?? 0)),
      evidence('Order ID', order.orderId),
      evidence('Order status after', probe.status),
      evidence('Fulfilments', String(probe.fulfillmentCount)),
    ]
    if (probe.fulfillmentCount > 0) {
      return {
        verdict: 'leak',
        merchantLeakCents: order.amountCents,
        detail: `The listener accepted an event it could not authenticate and shipped order ${order.orderId} ${times(probe.fulfillmentCount)}. Nothing was paid: ${toDecimal(order.amountCents)} ${order.currency} of goods went out on a message anyone could have sent.`,
        evidence: facts,
      }
    }
    return {
      verdict: 'sealed',
      detail: `The listener answered ${first?.status} and left order ${order.orderId} at "${probe.status}". An unverified event moved nothing.`,
      evidence: facts,
    }
  },
}

/** Scenario 2 — the same event delivered twice must be acted on once. */
const duplicateOnce: Invariant = {
  id: 'echo.duplicate-event-once',
  persona: 'echo',
  title: 'The same event ID is acted on exactly once',
  severity: 'high',
  fix: 'Record every webhook event ID you have processed and return 200 without re-processing when one repeats. PayPal retries, so repeats are routine.',
  evaluate(view) {
    const order = view.order()
    const probe = view.lastProbe(order?.orderId)
    const delivered = view.deliveries((entry) => entry.signed)
    const repeated = delivered.filter((entry) => entry.eventId === delivered[0]?.eventId)
    if (!order || !probe?.found || repeated.length < 2) {
      return { verdict: 'inconclusive', detail: 'The same event was not delivered twice.' }
    }
    const facts = [
      evidence('Event ID', repeated[0]?.eventId ?? 'unknown'),
      evidence('Deliveries of that ID', String(repeated.length)),
      evidence('Listener answered', repeated.map((entry) => entry.status).join(', ')),
      evidence('Order ID', order.orderId),
      evidence('Fulfilments', String(probe.fulfillmentCount)),
    ]
    if (probe.fulfillmentCount === 0) {
      return {
        verdict: 'inconclusive',
        detail: 'The listener never acted on the valid event, so there is nothing to deduplicate.',
        evidence: facts,
      }
    }
    if (probe.fulfillmentCount > 1) {
      const extra = probe.fulfillmentCount - 1
      return {
        verdict: 'leak',
        merchantLeakCents: order.amountCents * extra,
        detail: `Event ${repeated[0]?.eventId} was delivered ${times(repeated.length)} and order ${order.orderId} shipped ${times(probe.fulfillmentCount)}. One payment, ${probe.fulfillmentCount} shipments: ${toDecimal(order.amountCents * extra)} ${order.currency} out the door.`,
        evidence: facts,
      }
    }
    return {
      verdict: 'sealed',
      detail: `Event ${repeated[0]?.eventId} was delivered ${times(repeated.length)} and order ${order.orderId} shipped once.`,
      evidence: facts,
    }
  },
}

/** Scenario 3 — a late redelivery must not undo a refund. */
const noRegression: Invariant = {
  id: 'echo.no-state-regression',
  persona: 'echo',
  title: 'A late event never reverses a newer one',
  severity: 'high',
  fix: 'Keep the create_time of the last event you applied per resource and ignore any event older than it. Webhook delivery is not ordered.',
  evaluate(view) {
    const order = view.order()
    if (!order) return { verdict: 'inconclusive', detail: 'No order to judge.' }
    const probes = view.probes(order.orderId)
    const refundedAt = probes.findIndex((entry) => entry.status === 'refunded')
    if (refundedAt === -1) {
      return { verdict: 'inconclusive', detail: 'The order never reached a refunded state.' }
    }
    const after = probes.slice(refundedAt + 1)
    const last = after[after.length - 1]
    if (!last) return { verdict: 'inconclusive', detail: 'Nothing was probed after the refund.' }
    const refunded = probes[refundedAt]
    const deliveries = view.deliveries()
    const refundIndex = deliveries.findIndex(
      (entry) => entry.eventType === 'PAYMENT.CAPTURE.REFUNDED',
    )
    // A payment event that arrived after the refund but was created before it: a late redelivery.
    const stale = deliveries
      .slice(refundIndex + 1)
      .filter(
        (entry) =>
          entry.eventType === 'PAYMENT.CAPTURE.COMPLETED' &&
          entry.createTime < (deliveries[refundIndex]?.createTime ?? ''),
      )
    if (refundIndex === -1 || stale.length === 0) {
      return {
        verdict: 'inconclusive',
        detail: 'No payment event was redelivered after the refund.',
      }
    }
    const facts = [
      evidence('Order ID', order.orderId),
      evidence('Status after the refund', refunded?.status ?? 'unknown'),
      evidence('Replayed event ID', stale[stale.length - 1]?.eventId ?? 'unknown'),
      evidence('Replayed event created', stale[stale.length - 1]?.createTime ?? 'unknown'),
      evidence('Status after the replay', last.status),
      evidence('Fulfilments', String(last.fulfillmentCount)),
    ]
    const regressed =
      last.status !== 'refunded' || last.fulfillmentCount > (refunded?.fulfillmentCount ?? 0)
    if (regressed) {
      return {
        verdict: 'leak',
        merchantLeakCents: order.amountCents,
        detail: `A redelivered payment event older than the refund put order ${order.orderId} back to "${last.status}". The money is refunded and the goods are gone: ${toDecimal(order.amountCents)} ${order.currency}.`,
        evidence: facts,
      }
    }
    return {
      verdict: 'sealed',
      detail: `A redelivered payment event older than the refund was ignored; order ${order.orderId} stayed "${last.status}".`,
      evidence: facts,
    }
  },
}

const openOrder = (context: ScenarioContext) =>
  context.target.openOrder({ amountCents: context.rng.pick(AMOUNTS) })

const unsignedScenario: Scenario = {
  id: 'echo.unsigned-event',
  persona: 'echo',
  title: 'An unsigned "you have been paid"',
  plan: [
    'Open an order and leave it awaiting payment.',
    'Deliver a well-formed PAYMENT.CAPTURE.COMPLETED with no valid signature.',
    'Ask the target what it now believes about the order.',
  ],
  invariants: [unsignedIgnored],
  async act(context) {
    const order = await openOrder(context)
    context.step(
      `Order ${order.orderId} is awaiting payment for ${toDecimal(order.amountCents)} ${order.currency}.`,
    )
    const event = captureCompleted({
      id: context.rng.id('WH'),
      orderId: order.orderId,
      captureId: order.captureId,
      amountCents: order.amountCents,
      currency: order.currency,
      createTime: context.now(),
    })
    const result = await context.target.deliverWebhook(event, { signed: false })
    context.step(
      `Delivered ${event.id} without a signature; the listener answered ${result.status}.`,
    )
    await context.target.probeOrder(order.orderId)
  },
}

const duplicateScenario: Scenario = {
  id: 'echo.duplicate-event',
  persona: 'echo',
  title: 'The same payment event, twice',
  plan: [
    'Open an order and leave it awaiting payment.',
    'Deliver a signed PAYMENT.CAPTURE.COMPLETED.',
    'Deliver the identical event again, exactly as PayPal retries.',
    'Count how many times the order shipped.',
  ],
  invariants: [duplicateOnce],
  async act(context) {
    const order = await openOrder(context)
    const event = captureCompleted({
      id: context.rng.id('WH'),
      orderId: order.orderId,
      captureId: order.captureId,
      amountCents: order.amountCents,
      currency: order.currency,
      createTime: context.now(),
    })
    await context.target.deliverWebhook(event, { signed: true })
    context.step(`Delivered ${event.id}.`)
    await context.target.deliverWebhook(event, { signed: true })
    context.step(`Delivered ${event.id} again, byte for byte.`)
    await context.target.probeOrder(order.orderId)
  },
}

const outOfOrderScenario: Scenario = {
  id: 'echo.out-of-order-event',
  persona: 'echo',
  title: 'A payment event that arrives after the refund',
  plan: [
    'Open an order, pay it, and watch it ship.',
    'Refund it and confirm the target agrees.',
    'Redeliver the older payment event, as a backed-up queue would.',
    'Check the order did not go back to paid.',
  ],
  invariants: [noRegression],
  async act(context) {
    const order = await openOrder(context)
    const paidAt = context.now()
    const paid = captureCompleted({
      id: context.rng.id('WH'),
      orderId: order.orderId,
      captureId: order.captureId,
      amountCents: order.amountCents,
      currency: order.currency,
      createTime: paidAt,
    })
    await context.target.deliverWebhook(paid, { signed: true })
    await context.target.probeOrder(order.orderId)

    const refunded = captureRefunded({
      id: context.rng.id('WH'),
      orderId: order.orderId,
      captureId: order.captureId,
      amountCents: order.amountCents,
      currency: order.currency,
      createTime: new Date(paidAt.getTime() + 60_000),
    })
    await context.target.deliverWebhook(refunded, { signed: true })
    await context.target.probeOrder(order.orderId)
    context.step(`Order ${order.orderId} is refunded.`)

    // A new transmission carrying the old event: same payload, older create_time.
    const replay = captureCompleted({
      id: context.rng.id('WH'),
      orderId: order.orderId,
      captureId: order.captureId,
      amountCents: order.amountCents,
      currency: order.currency,
      createTime: paidAt,
    })
    await context.target.deliverWebhook(replay, { signed: true })
    context.step(`Redelivered the payment event as ${replay.id}, stamped before the refund.`)
    await context.target.probeOrder(order.orderId)
  },
}

export const echo: PersonaModule = {
  id: 'echo',
  scenarios: [unsignedScenario, duplicateScenario, outOfOrderScenario],
}

export const echoInvariants = [unsignedIgnored, duplicateOnce, noRegression] as const
