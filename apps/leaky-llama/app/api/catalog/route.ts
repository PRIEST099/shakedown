import { CATALOG } from '@/lib/catalog'
import { json } from '@/lib/http'

/** What the store sells, at its own prices. Public, like any storefront. */
export function GET() {
  return json({ items: CATALOG.map(({ sku, name, priceCents }) => ({ sku, name, priceCents })) })
}
