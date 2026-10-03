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
  times,
} from './checkout-kit'

/**
 * The Double-Clicker — idempotency.
 *
 * "Clicks Pay twice. Retries on hotel Wi-Fi. Expects one order."
 */

const oneCharge: Invariant = {
  id: 'double-clicker.one-checkout-one-charge',
  persona: 'double-clicker',
  title: 'One checkout is charged once, however often Pay is pressed',
  severity: 'high',
  fix: 'Mint one key per checkout attempt and send it as the PayPal-Request-Id when you create the order. A second submit then gets the same order back instead of opening another.',
  evaluate(view) {
    const submits = view.checkouts()
    const key = submits[0]?.checkoutKey
    const orders = view.paypalOrderIds()
    if (!key || orders.length === 0) {
      return { verdict: 'inconclusive', detail: 'No checkout was opened.' }
    }
    const charges = orders.flatMap((id) => completedCaptures(view.paypalOrder(id)))
    const facts = [
      evidence('Checkout key', key),
      evidence('Submits', submits.length),
      evidence('PayPal orders opened', orders.join(', ')),
      evidence(
        'Completed captures',
        charges.map((charge) => `${charge.id} ${dollars(charge.amountCents)}`).join(', ') || 'none',
      ),
    ]
    if (charges.length === 0) {
      return {
        verdict: 'inconclusive',
        detail: 'Nothing was charged, so there is no second charge to look for.',
        evidence: facts,
      }
    }
    if (charges.length > 1) {
      const extra = charges.slice(1).reduce((sum, charge) => sum + charge.amountCents, 0)
      return {
        verdict: 'leak',
        customerHarmCents: extra,
        detail: `Pay was pressed twice on one checkout. The store opened ${orders.length} PayPal orders and the customer was charged ${times(charges.length)}: ${dollars(extra)} more than they meant to pay.`,
        evidence: facts,
      }
    }
    return {
      verdict: 'sealed',
      detail: `Both submits came back to PayPal order ${orders[0]}, which was charged once.`,
      evidence: facts,
    }
  },
}

const oneShipment: Invariant = {
  id: 'double-clicker.one-payment-one-shipment',
  persona: 'double-clicker',
  title: 'A retried capture never ships twice',
  severity: 'high',
  fix: 'Send one PayPal-Request-Id per capture, so a retry gets the original answer back, and make fulfilment idempotent on the order ID.',
  evaluate(view) {
    const paypalOrderId = onlyOrder(view)
    if (!paypalOrderId) return { verdict: 'inconclusive', detail: 'No PayPal order was opened.' }
    const charges = completedCaptures(view.paypalOrder(paypalOrderId))
    const attempts = view.captures(paypalOrderId)
    const probe = view.lastProbe()
    const shipped = probe?.shipments?.filter((shipment) => shipment.source === 'checkout') ?? []
    const facts = [
      evidence('PayPal order', paypalOrderId),
      evidence('Captured at PayPal', charges.map((charge) => charge.id).join(', ') || 'none'),
      evidence('Capture requests sent', attempts.length),
      evidence('Store answered', attempts.map((attempt) => attempt.answer).join(', ') || 'nothing'),
      evidence('Shipments from checkout', shipped.length),
    ]
    if (charges.length === 0) {
      return {
        verdict: 'inconclusive',
        detail: 'PayPal completed no capture, so there is no payment to count shipments against.',
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
    if (shipped.length > charges.length) {
      const extra = shipped
        .slice(charges.length)
        .reduce((sum, shipment) => sum + shipment.valueCents, 0)
      return {
        verdict: 'leak',
        merchantLeakCents: extra,
        detail: `The capture was retried. PayPal captured ${times(charges.length)}, but the store shipped ${times(shipped.length)}: ${dollars(extra)} of goods with no payment behind them.`,
        evidence: facts,
      }
    }
    return {
      verdict: 'sealed',
      detail: `The capture was retried. PayPal captured once and the store shipped ${times(shipped.length)}.`,
      evidence: facts,
    }
  },
}

const doubleSubmit: Scenario = {
  id: 'double-clicker.double-submit',
  persona: 'double-clicker',
  title: 'Presses Pay twice before the page answers',
  requires: ['checkout', 'paypal'],
  plan: [
    'Fill a cart and press Pay twice at once, sending the one checkout key a browser would.',
    'Pay by card at PayPal for every order the store hands back.',
    'Let the store capture each of them.',
    "Read each of those orders back from PayPal's ledger.",
  ],
  invariants: [oneCharge],
  async act(context) {
    const checkout = checkoutOf(context)
    const paypal = paypalOf(context)
    const item = pickItem(context, checkout.catalog)
    const input = {
      lines: [{ sku: item.sku, qty: 1 }],
      email: customerEmail(context),
      // A browser mints one key per checkout attempt; never reuse one from an earlier run.
      checkoutKey: `${context.rng.id('CK')}-${context.runNonce}`,
    }
    const opened = await Promise.all([checkout.openCheckout(input), checkout.openCheckout(input)])
    const orders = [
      ...new Set(opened.map((order) => order.paypalOrderId).filter(Boolean)),
    ] as string[]
    context.step(
      `Two submits; the store opened ${orders.length === 1 ? 'one PayPal order' : `${orders.length} PayPal orders`}.`,
    )
    for (const id of orders) {
      await paypal.confirmCard(id)
      await checkout.capture(id)
    }
    await settle(context, opened)
  },
}

const retriedCapture: Scenario = {
  id: 'double-clicker.retried-capture',
  persona: 'double-clicker',
  title: 'Retries the payment on hotel Wi-Fi',
  requires: ['checkout', 'paypal'],
  plan: [
    'Open a checkout and pay by card at PayPal.',
    'Ask the store to capture, then ask again, as a browser does when the first answer never arrives.',
    'Read what the store shipped and what PayPal captured.',
  ],
  invariants: [oneShipment],
  async act(context) {
    const checkout = checkoutOf(context)
    const paypal = paypalOf(context)
    const item = pickItem(context, checkout.catalog)
    const opened = await checkout.openCheckout({
      lines: [{ sku: item.sku, qty: 1 }],
      email: customerEmail(context),
    })
    if (!opened.paypalOrderId) {
      context.step(`The store did not open a PayPal order (HTTP ${opened.status}).`)
      return
    }
    await paypal.confirmCard(opened.paypalOrderId)
    await checkout.capture(opened.paypalOrderId)
    context.step('Captured once; the answer "never arrived", so the browser asks again.')
    await checkout.capture(opened.paypalOrderId)
    await settle(context, [opened])
  },
}

export const doubleClicker: PersonaModule = {
  id: 'double-clicker',
  scenarios: [doubleSubmit, retriedCapture],
}

export const doubleClickerInvariants = [oneCharge, oneShipment] as const
