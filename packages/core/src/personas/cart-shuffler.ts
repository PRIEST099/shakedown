import type { Invariant } from '../grader'
import { evidence } from '../grader'
import { completedCaptures } from '../paypal-side'
import type { PersonaModule, Scenario } from '../persona'
import {
  cheapest,
  checkoutOf,
  customerEmail,
  describeLines,
  dollars,
  onlyOrder,
  paypalOf,
  priciest,
  settle,
} from './checkout-kit'

/**
 * The Cart Shuffler — amount integrity.
 *
 * "Approves the cart. Then changes it."
 */

const withinCaptured: Invariant = {
  id: 'cart-shuffler.shipped-within-captured',
  persona: 'cart-shuffler',
  title: 'Goods shipped are never worth more than PayPal captured',
  severity: 'high',
  fix: 'Price the order on your server from your own catalog, and before shipping compare the captured amount and currency with that order. Ship the order, never the cart the browser sends.',
  evaluate(view) {
    const paypalOrderId = onlyOrder(view)
    if (!paypalOrderId) return { verdict: 'inconclusive', detail: 'No PayPal order was opened.' }
    const charges = completedCaptures(view.paypalOrder(paypalOrderId))
    const captured = charges.reduce((sum, charge) => sum + charge.amountCents, 0)
    const probe = view.lastProbe()
    const opened = view.checkouts()[0]
    const sentAtCapture = view.captures(paypalOrderId)[0]?.lines
    const largest = [...(probe?.shipments ?? [])].sort((a, b) => b.valueCents - a.valueCents)[0]
    const facts = [
      evidence('PayPal order', paypalOrderId),
      evidence(
        'Captured at PayPal',
        `${dollars(captured)} (${charges.map((charge) => charge.id).join(', ') || 'no capture'})`,
      ),
      evidence('Cart sent at checkout', describeLines(opened?.lines)),
      evidence('Cart sent at capture', describeLines(sentAtCapture)),
      evidence(
        "Store's order total",
        opened?.amountCents === undefined ? 'unknown' : dollars(opened.amountCents),
      ),
      evidence(
        'Goods shipped',
        largest ? `${dollars(largest.valueCents)} at the store's own prices` : 'nothing',
      ),
    ]
    if (captured === 0) {
      return {
        verdict: 'inconclusive',
        detail: 'PayPal captured nothing, so there is nothing to weigh the goods against.',
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
    if (largest && largest.valueCents > captured) {
      const gap = largest.valueCents - captured
      return {
        verdict: 'leak',
        merchantLeakCents: gap,
        detail: `PayPal captured ${dollars(captured)}, and the store shipped goods worth ${dollars(largest.valueCents)} at its own prices: ${dollars(gap)} of stock left unpaid.`,
        evidence: facts,
      }
    }
    return {
      verdict: 'sealed',
      detail: largest
        ? `PayPal captured ${dollars(captured)} and the store shipped exactly that much.`
        : `PayPal captured ${dollars(captured)}; the store held the order for a person instead of shipping it.`,
      evidence: facts,
    }
  },
}

const ownPrice: Scenario = {
  id: 'cart-shuffler.own-price',
  persona: 'cart-shuffler',
  title: 'Brings their own price tag',
  requires: ['checkout', 'paypal'],
  plan: [
    'Put the most expensive item in the cart and send a price of $1.00 for it.',
    'Pay by card at PayPal and let the store capture.',
    'Compare what PayPal captured with what the store shipped.',
  ],
  invariants: [withinCaptured],
  async act(context) {
    const checkout = checkoutOf(context)
    const item = priciest(checkout.catalog)
    const opened = await checkout.openCheckout({
      lines: [{ sku: item.sku, qty: 1, unitCents: 100 }],
      email: customerEmail(context),
    })
    if (!opened.paypalOrderId) {
      context.step(`The store did not open a PayPal order (HTTP ${opened.status}).`)
      return
    }
    context.step(
      `The store opened a PayPal order for ${opened.amountCents === undefined ? 'an unknown amount' : dollars(opened.amountCents)}.`,
    )
    await paypalOf(context).confirmCard(opened.paypalOrderId)
    await checkout.capture(opened.paypalOrderId)
    await settle(context, [opened])
  },
}

const swapAfterApproval: Scenario = {
  id: 'cart-shuffler.swap-after-approval',
  persona: 'cart-shuffler',
  title: 'Approves the cart, then changes it',
  requires: ['checkout', 'paypal'],
  plan: [
    'Open a checkout for the cheapest item and pay for it at PayPal.',
    'Send the capture along with a different cart: two of the most expensive item.',
    'Compare what PayPal captured with what the store shipped.',
  ],
  invariants: [withinCaptured],
  async act(context) {
    const checkout = checkoutOf(context)
    const opened = await checkout.openCheckout({
      lines: [{ sku: cheapest(checkout.catalog).sku, qty: 1 }],
      email: customerEmail(context),
    })
    if (!opened.paypalOrderId) {
      context.step(`The store did not open a PayPal order (HTTP ${opened.status}).`)
      return
    }
    await paypalOf(context).confirmCard(opened.paypalOrderId)
    await checkout.capture(opened.paypalOrderId, {
      lines: [{ sku: priciest(checkout.catalog).sku, qty: 2 }],
    })
    await settle(context, [opened])
  },
}

export const cartShuffler: PersonaModule = {
  id: 'cart-shuffler',
  scenarios: [ownPrice, swapAfterApproval],
}

export const cartShufflerInvariants = [withinCaptured] as const
