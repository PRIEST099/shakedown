import type { LedgerView } from '../ledger'
import type { Cents } from '../money'
import { toDecimal } from '../money'
import type { PayPalSide } from '../paypal-side'
import type { ScenarioContext } from '../persona'
import type { CatalogItem, CheckoutLine, CheckoutOpened, CheckoutPort } from '../target'

/** The pieces every checkout scenario shares. */

export const dollars = (cents: Cents) => `$${toDecimal(cents)}`

export const times = (count: number) =>
  count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`

export function checkoutOf(context: ScenarioContext): CheckoutPort {
  if (!context.target.checkout) throw new Error('This scenario needs a checkout to walk through.')
  return context.target.checkout
}

export function paypalOf(context: ScenarioContext): PayPalSide {
  if (!context.paypal) throw new Error("This scenario needs PayPal's side of the checkout.")
  return context.paypal
}

/** A made-up customer on a reserved domain, different for every scenario and seed. */
export const customerEmail = (context: ScenarioContext) =>
  `customer-${context.rng.id('C', 8).slice(2).toLowerCase()}@example.com`

const byPrice = (catalog: readonly CatalogItem[]) =>
  [...catalog].sort((a, b) => a.priceCents - b.priceCents || a.sku.localeCompare(b.sku))

export const cheapest = (catalog: readonly CatalogItem[]) => byPrice(catalog)[0] as CatalogItem
export const priciest = (catalog: readonly CatalogItem[]) => byPrice(catalog).at(-1) as CatalogItem

export function pickItem(context: ScenarioContext, catalog: readonly CatalogItem[]): CatalogItem {
  if (catalog.length === 0) throw new Error('The store has nothing for sale.')
  return context.rng.pick(byPrice(catalog))
}

export const describeLines = (lines: readonly CheckoutLine[] | undefined) =>
  lines?.length
    ? lines
        .map(
          (line) =>
            `${line.qty} × ${line.sku}${line.unitCents === undefined ? '' : ` at ${dollars(line.unitCents)}`}`,
        )
        .join(', ')
    : 'none'

/**
 * Finish a scenario the same way every time: ask the store what it now believes about each
 * order, then read each order back from PayPal's ledger, which is what the grader trusts.
 */
export async function settle(context: ScenarioContext, opened: readonly CheckoutOpened[]) {
  const unique = (values: (string | undefined)[]) => [
    ...new Set(values.filter((v): v is string => Boolean(v))),
  ]
  for (const ref of unique(opened.map((order) => order.storeOrderId))) {
    await context.target.probeOrder(ref)
  }
  const paypal = paypalOf(context)
  for (const id of unique(opened.map((order) => order.paypalOrderId))) {
    await paypal.readOrder(id)
  }
}

/** The one PayPal order a single-checkout scenario is about. */
export const onlyOrder = (view: LedgerView) => view.paypalOrderIds()[0]
