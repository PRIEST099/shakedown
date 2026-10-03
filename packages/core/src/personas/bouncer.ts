import type { Invariant } from '../grader'
import { evidence } from '../grader'
import { completedCaptures } from '../paypal-side'
import type { PersonaModule, Scenario } from '../persona'
import {
  checkoutOf,
  customerEmail,
  dollars,
  onlyOrder,
  paypalOf,
  pickItem,
  settle,
} from './checkout-kit'

/**
 * The Bouncer — decline handling.
 *
 * "Their card always bounces. Your checkout should land on its feet."
 */

const noShipWithoutPayment: Invariant = {
  id: 'bouncer.no-ship-without-payment',
  persona: 'bouncer',
  title: 'A declined card never ships anything',
  severity: 'high',
  fix: 'Before fulfilling, check that purchase_units[].payments.captures[].status is COMPLETED. A declined card can leave the order itself COMPLETED.',
  evaluate(view) {
    const paypalOrderId = onlyOrder(view)
    const truth = paypalOrderId ? view.paypalOrder(paypalOrderId) : undefined
    if (!paypalOrderId || !truth) {
      return { verdict: 'inconclusive', detail: "PayPal's ledger was not read for this order." }
    }
    const capture = truth.captures[0]
    const answer = view.captures(paypalOrderId)[0]
    const probe = view.lastProbe()
    const shipped = probe?.shipments ?? []
    const shippedValue = shipped.reduce((sum, shipment) => sum + shipment.valueCents, 0)
    const facts = [
      evidence('PayPal order', `${paypalOrderId} (${truth.status})`),
      evidence('Capture at PayPal', capture ? `${capture.id} (${capture.status})` : 'none'),
      evidence('Store told the customer', answer?.answer ?? 'nothing'),
      evidence(
        'Shipments',
        shipped.length ? `${shipped.length}, worth ${dollars(shippedValue)}` : 'none',
      ),
    ]
    if (completedCaptures(truth).length > 0) {
      return {
        verdict: 'inconclusive',
        detail: 'PayPal completed the capture, so the card did not bounce this time.',
        evidence: facts,
      }
    }
    if (!probe?.found || !probe.shipments) {
      return {
        verdict: 'inconclusive',
        detail: 'The store did not report its shipments.',
        evidence: facts,
      }
    }
    if (shipped.length > 0) {
      return {
        verdict: 'leak',
        merchantLeakCents: shippedValue,
        detail: `PayPal declined the card: capture ${capture?.id ?? '(none)'} is ${capture?.status ?? 'missing'} and nothing was paid. The store told the customer "${answer?.answer ?? 'nothing'}" and shipped ${dollars(shippedValue)} of goods anyway.`,
        evidence: facts,
      }
    }
    return {
      verdict: 'sealed',
      detail: `PayPal declined the card${capture ? ` (capture ${capture.id} ${capture.status})` : ''}. The store answered "${answer?.answer ?? 'nothing'}" and shipped nothing.`,
      evidence: facts,
    }
  },
}

const bouncingCard: Scenario = {
  id: 'bouncer.declined-card',
  persona: 'bouncer',
  title: 'Pays with a card that bounces',
  requires: ['checkout', 'paypal'],
  plan: [
    'Open a checkout and pay at PayPal with a sandbox card set up to be declined.',
    'Let the store capture.',
    "Compare PayPal's capture status with what the store did.",
  ],
  invariants: [noShipWithoutPayment],
  async act(context) {
    const checkout = checkoutOf(context)
    const opened = await checkout.openCheckout({
      lines: [{ sku: pickItem(context, checkout.catalog).sku, qty: 1 }],
      email: customerEmail(context),
    })
    if (!opened.paypalOrderId) {
      context.step(`The store did not open a PayPal order (HTTP ${opened.status}).`)
      return
    }
    await paypalOf(context).confirmCard(opened.paypalOrderId, { decline: true })
    await checkout.capture(opened.paypalOrderId)
    await settle(context, [opened])
  },
}

export const bouncer: PersonaModule = {
  id: 'bouncer',
  scenarios: [bouncingCard],
}

export const bouncerInvariants = [noShipWithoutPayment] as const
