import type { Route } from './source'

/**
 * What a handler expects in its request body and puts in its answer, read from its code. These
 * are guesses, and the report says so: a body's fields come from how the handler reads them
 * (`const { cart } = req.body`, `await request.json()`, a typed `readJson<{ ... }>`); an answer's
 * fields from what it hands to `json(...)`, or PayPal's own order when it passes that through.
 */

export interface BodyGuess {
  /** The top-level fields the handler reads, with the placeholder each one gets. */
  fields: { name: string; value: string | undefined }[]
  /** The fields of one cart line, when the cart is a list. */
  line: { name: string; value: string | undefined }[]
}

const PLACEHOLDER: [RegExp, string][] = [
  [/^(?:cart|items|lines|lineItems|line_items|products|basket|order_?items)$/i, '{{lines}}'],
  [/^(?:email|customerEmail|payerEmail|buyerEmail|receiptEmail)$/i, '{{email}}'],
  [
    /^(?:checkoutKey|idempotencyKey|idempotency_key|requestId|checkoutId|attemptId)$/i,
    '{{checkoutKey}}',
  ],
  [/^(?:total|amount|totalAmount|value|price)$/i, '{{total}}'],
  [/^(?:totalCents|amountCents)$/i, '{{totalCents}}'],
  [/^(?:currency|currencyCode|currency_code)$/i, '{{currency}}'],
]

const LINE_PLACEHOLDER: [RegExp, string][] = [
  [/^(?:sku|id|productId|product_id|itemId|item_id|variantId|code)$/i, '{{sku}}'],
  [/^(?:qty|quantity|count|amount)$/i, '{{qty}}'],
  [/^(?:unitCents|priceCents|unit_cents)$/i, '{{unitCents}}'],
  [/^(?:price|unitPrice|unit_price|unitAmount|unit_amount|cost)$/i, '{{unitPrice}}'],
  [/^(?:name|title)$/i, '{{name}}'],
]

const placeholder = (name: string, table: [RegExp, string][]) =>
  table.find(([pattern]) => pattern.test(name))?.[1]

const fieldsOf = (list: string) =>
  [...list.matchAll(/(?:^|[{,;\s])([A-Za-z_$][\w$]*)\s*\??\s*(?=[:,}=;\s])/g)]
    .map((m) => m[1] ?? '')
    .filter(
      (name) =>
        name && !/^(?:const|let|var|await|as|string|number|boolean|unknown|any)$/.test(name),
    )

/** The fields a handler reads from its request body. */
export function bodyOf(route: Route): BodyGuess {
  const own = route.pieces[0]?.text ?? ''
  const all = route.pieces.map((piece) => piece.text).join('\n')
  const names = new Set<string>()
  // const { a, b } = await req.json() / = req.body / = await readBody(event)
  for (const m of own.matchAll(
    /(?:const|let|var)\s*\{([^}]*)\}\s*(?::[^=]+)?=\s*(?:await\s+)?(?:\w+\.json\(\)|req(?:uest)?\.body|\w+\.body|readBody\(|readJson|await\s+request\.json)/g,
  ))
    for (const name of fieldsOf(m[1] ?? '')) names.add(name)
  // A typed read: readJson<{ lines?: CartLine[]; email?: string }>(request)
  for (const m of own.matchAll(/(?:json|readJson|readBody|parse)\s*<\s*\{([^}]*)\}\s*>/g))
    for (const name of fieldsOf(m[1] ?? '')) names.add(name)
  // const body = await req.json(); body.cart / req.body.cart
  const bodyVar =
    /(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?(?:\w+\.json\(\)|req(?:uest)?\.body|readJson)/.exec(
      own,
    )?.[1]
  for (const v of [bodyVar, 'req.body', 'request.body'].filter(Boolean) as string[]) {
    const escaped = v.replace('.', '\\.')
    for (const m of own.matchAll(new RegExp(`\\b${escaped}\\.([A-Za-z_$][\\w$]*)`, 'g')))
      names.add(m[1] ?? '')
  }
  const fields = [...names].map((name) => ({ name, value: placeholder(name, PLACEHOLDER) }))
  // The cart's line fields: a named line type, or what the code reads off each item.
  const lineNames = new Set<string>()
  const cartType = /(?:lines|cart|items)\??\s*:\s*([A-Z]\w*)\[\]/.exec(own)?.[1]
  if (cartType) {
    const decl = new RegExp(`(?:interface|type)\\s+${cartType}\\s*=?\\s*\\{([^}]*)\\}`).exec(
      all,
    )?.[1]
    for (const name of fieldsOf(decl ?? '')) lineNames.add(name)
  }
  if (lineNames.size === 0) {
    for (const m of all.matchAll(
      /\b(?:item|line|entry|product|i|l|it|x|cartItem)\.([A-Za-z_$][\w$]*)\b/g,
    )) {
      const name = m[1] ?? ''
      if (placeholder(name, LINE_PLACEHOLDER)) lineNames.add(name)
    }
  }
  const line = [...lineNames].map((name) => ({ name, value: placeholder(name, LINE_PLACEHOLDER) }))
  return { fields, line }
}

export interface AnswerGuess {
  /** Where the PayPal order ID is. */
  paypalOrderId?: string
  /** Where the store's own order number is, if it has one. */
  storeOrderId?: string
  /** True when the handler hands PayPal's own answer straight back. */
  passesPayPalThrough: boolean
  /** The top-level fields it answers with, when they could be read. */
  fields: string[]
}

/** What a handler answers with. */
export function answerOf(route: Route): AnswerGuess {
  const own = route.pieces[0]?.text ?? ''
  const fields = new Set<string>()
  for (const m of own.matchAll(/(?:\.json|json)\(\s*\{([\s\S]*?)\}\s*[,)]/g)) {
    for (const name of fieldsOf(m[1] ?? '')) fields.add(name)
  }
  const list = [...fields]
  // `res.json(jsonResponse)` or `return Response.json(order)`: PayPal's order, passed through.
  const passesPayPalThrough =
    list.length === 0 &&
    /(?:\.json|json)\(\s*(?:jsonResponse|order|response|data|result|captureData|orderData)\b/.test(
      own,
    )
  const paypalOrderId = passesPayPalThrough
    ? 'id'
    : (list.find((name) => /^(?:paypalOrderId|paypal_order_id|orderID)$/i.test(name)) ??
      list.find((name) => /^(?:orderId|order_id|id)$/i.test(name)))
  const storeOrderId = list.find((name) =>
    /^(?:orderNumber|order_number|orderRef|reference|storeOrderId|number)$/i.test(name),
  )
  return { paypalOrderId, storeOrderId, passesPayPalThrough, fields: list }
}

/** How a catalog route lists its products. `extra` is the code of the list it answers with. */
export function catalogOf(route: Route, extra = '') {
  const all = `${route.pieces.map((piece) => piece.text).join('\n')}\n${extra}`
  const own = route.pieces[0]?.text ?? ''
  const items = /json\(\s*\{\s*(\w+)\s*[:,}]/.exec(own)?.[1]
  const price = /\b(priceCents|price_cents|unitCents|price|unitPrice|unit_price|amount)\s*:/.exec(
    all,
  )?.[1]
  const sku = /\b(sku|id|productId|slug)\s*:/.exec(all)?.[1]
  const name = /\b(name|title)\s*:/.exec(all)?.[1]
  return {
    items: items ?? '',
    sku: sku ?? 'id',
    name: name ?? 'name',
    price: price ?? 'price',
    priceUnit: price && /cents/i.test(price) ? ('cents' as const) : ('dollars' as const),
  }
}
