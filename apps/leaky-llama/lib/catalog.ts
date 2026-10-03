import type { LineItem } from './db/schema'

export interface Product {
  sku: string
  name: string
  blurb: string
  priceCents: number
  /** Drawn by <ProductArt>. */
  art: 'socks' | 'bottle' | 'panniers' | 'guide'
}

export const CATALOG: readonly Product[] = [
  {
    sku: 'LL-SOCK-2',
    name: 'Alpaca-blend trail socks',
    blurb: 'Two pairs. Warm when wet, dry by morning.',
    priceCents: 1800,
    art: 'socks',
  },
  {
    sku: 'LL-BTL-750',
    name: 'Insulated bottle, 750 ml',
    blurb: 'Steel, double-walled. Tea stays hot for twelve hours.',
    priceCents: 3600,
    art: 'bottle',
  },
  {
    sku: 'LL-PNR-PR',
    name: 'Waxed canvas panniers',
    blurb: 'A pair of saddlebags. Fits a pack llama, or a bike.',
    priceCents: 12400,
    art: 'panniers',
  },
  {
    sku: 'LL-BK-001',
    name: 'Llamas & You: a field guide',
    blurb: 'Paperback, 212 pages. Chapter 4 is about spitting.',
    priceCents: 2400,
    art: 'guide',
  },
]

const BY_SKU = new Map(CATALOG.map((product) => [product.sku, product]))

export const productBySku = (sku: string): Product | undefined => BY_SKU.get(sku)

/** What a browser sends: a SKU and a quantity, and sometimes a price it worked out itself. */
export interface CartLine {
  sku: string
  qty: number
  unitCents?: number
}

export class CartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CartError'
  }
}

const MAX_QTY = 20

/**
 * Turn cart lines into priced line items. `trustClientPrices` is the leaky habit of using the
 * price the browser sent; sealed pricing always comes from the catalog.
 */
export function priceCart(
  lines: readonly CartLine[],
  options: { trustClientPrices: boolean },
): LineItem[] {
  if (lines.length === 0) throw new CartError('The cart is empty.')
  return lines.map((line) => {
    const product = productBySku(line.sku)
    if (!product) throw new CartError(`Unknown product ${line.sku}.`)
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
      throw new CartError(`Quantity for ${line.sku} must be between 1 and ${MAX_QTY}.`)
    }
    const clientPrice =
      options.trustClientPrices && Number.isInteger(line.unitCents) && (line.unitCents ?? -1) >= 0
        ? line.unitCents
        : undefined
    return {
      sku: product.sku,
      name: product.name,
      qty: line.qty,
      unitCents: clientPrice ?? product.priceCents,
    }
  })
}

export const totalOf = (items: readonly LineItem[]): number =>
  items.reduce((sum, item) => sum + item.qty * item.unitCents, 0)

/** What the catalog says these items are worth, whatever price they were sold at. */
export const catalogValueOf = (items: readonly LineItem[]): number =>
  items.reduce((sum, item) => sum + item.qty * (productBySku(item.sku)?.priceCents ?? 0), 0)
