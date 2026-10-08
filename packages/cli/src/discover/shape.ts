import { closeOf, type Route, type SourceFile } from './source'

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
  // A checkout of one product: the first line's.
  [/^(?:itemId|item_id|productId|product_id|sku|variantId|product)$/i, '{{sku}}'],
  [/^(?:quantity|qty)$/i, '{{qty}}'],
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
    /(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?(?:\w+\.json\(\)|_?req(?:uest)?\.body|readJson)/.exec(
      own,
    )?.[1]
  if (bodyVar) {
    for (const m of own.matchAll(new RegExp(`\\b${bodyVar}\\.([A-Za-z_$][\\w$]*)`, 'g')))
      names.add(m[1] ?? '')
  }
  // NestJS: @Body('amount') amount: string
  for (const m of own.matchAll(/@Body\(\s*['"](\w+)['"]\s*\)/g)) names.add(m[1] ?? '')
  // NestJS: @Body() dto: CreateOrderDto, then dto.amount
  const dto = /@Body\(\s*\)\s*(\w+)/.exec(own)?.[1]
  if (dto) {
    for (const m of own.matchAll(new RegExp(`\\b${dto}\\.([A-Za-z_$][\\w$]*)`, 'g')))
      names.add(m[1] ?? '')
  }
  // req.body.cart, _req.body.itemId, ctx.request.body.items
  for (const m of own.matchAll(/\b(?:_?req|request|ctx\.request|event)\.body\.([A-Za-z_$][\w$]*)/g))
    names.add(m[1] ?? '')
  // const { cart } = _req.body
  for (const m of own.matchAll(
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:_?req|request|ctx\.request)\.body\b/g,
  ))
    for (const name of fieldsOf(m[1] ?? '')) names.add(name)
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
  /** The field PayPal's answer is wrapped in, for `res.json({ data: response.body })`. */
  under?: string
  /** The top-level fields it answers with, when they could be read. */
  fields: string[]
}

/** What a handler answers with. */
export function answerOf(route: Route): AnswerGuess {
  // A route that names its handler (router.post('/orders', createOrder)) answers from that.
  const first = route.pieces[0]?.text ?? ''
  const own = /\bjson\(|\.send\(|\breturn\b/.test(first) ? first : (route.pieces[1]?.text ?? first)
  const fields = new Set<string>()
  for (const m of own.matchAll(/(?:\.json|json)\(\s*\{([\s\S]*?)\}\s*[,)]/g)) {
    for (const name of fieldsOf(m[1] ?? '')) fields.add(name)
  }
  const list = [...fields]
  // `res.json(jsonResponse)`, `res.json(data.result)`: PayPal's order, passed through. An error
  // answer elsewhere in the handler (`json({ error })`) doesn't change that.
  // Or a NestJS-style handler returns what a service hands back, and the service returns
  // PayPal's answer: `return this.paypal.createOrder(amount)` → `return response.data`.
  const delegates =
    /return\s+(?:await\s+)?(?:this\.)?[\w.]+\(/.test(own) && !/\bjson\(|Response\(/.test(own)
  const serviceReturnsPayPal = route.pieces
    .slice(1)
    .some(
      (piece) =>
        /v2\/checkout\/orders|ordersController\.|Orders(?:Create|Capture)Request/.test(
          piece.text,
        ) &&
        /return\s+(?:await\s+)?(?:response|res|result|order)(?:\.(?:data|result|body))?\s*;?\s*$/m.test(
          piece.text,
        ),
    )
  // Or wrapped in one field: res.json({ data: response.body })
  const under =
    /json\(\s*\{\s*(\w+)\s*:\s*(?:response|res|r|result|resp)\.(?:body|data)\s*\}\s*\)/.exec(
      own,
    )?.[1]
  const passesPayPalThrough =
    Boolean(under) ||
    /(?:\.json|json|\.send)\(\s*(?:jsonResponse|order|response|data(?:\.result)?|result|captureData|orderData|payload|paypalOrder)\s*\)/.test(
      own,
    ) ||
    (delegates && serviceReturnsPayPal)
  const paypalOrderId = passesPayPalThrough
    ? under
      ? `${under}.id`
      : 'id'
    : (list.find((name) => /^(?:paypalOrderId|paypal_order_id|orderID)$/i.test(name)) ??
      list.find((name) => /^(?:orderId|order_id|id)$/i.test(name)))
  const storeOrderId = list.find((name) =>
    /^(?:orderNumber|order_number|orderRef|reference|storeOrderId|number)$/i.test(name),
  )
  return { paypalOrderId, storeOrderId, passesPayPalThrough, under, fields: list }
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

/** The top-level entries of an object literal starting at `open`, each with its value's code. */
function entriesOf(text: string, open: number): { key: string; value: string }[] {
  const inner = text.slice(open + 1, closeOf(text, open))
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i]
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < inner.length && inner[i] !== c; i += 1) if (inner[i] === '\\') i += 1
      continue
    }
    if (c === '/' && inner[i + 1] === '/') {
      const end = inner.indexOf('\n', i)
      i = end === -1 ? inner.length : end
      continue
    }
    if (c === '{' || c === '[' || c === '(') depth += 1
    else if (c === '}' || c === ']' || c === ')') depth -= 1
    else if (c === ',' && depth === 0) {
      parts.push(inner.slice(start, i))
      start = i + 1
    }
  }
  parts.push(inner.slice(start))
  const out: { key: string; value: string }[] = []
  for (const part of parts) {
    const clean = part.replace(/\/\/[^\n]*/g, '').trim()
    if (!clean || clean.startsWith('...')) continue
    const m = /^['"]?([A-Za-z_$][\w$]*)['"]?\s*(?::\s*([\s\S]*))?$/.exec(clean)
    if (m) out.push({ key: m[1] ?? '', value: (m[2] ?? m[1] ?? '').trim() })
  }
  return out
}

/**
 * How the store's own pages call a route: `fetch('/api/orders', { body: JSON.stringify({ cart:
 * [{ id, quantity }] }) })`, or `axios.post('/api/orders', { ... })`. PayPal's sample keeps the
 * cart's shape here, not in the server.
 */
export function clientBodyOf(
  files: readonly SourceFile[],
  routePath: string,
): BodyGuess | undefined {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // '/api/orders', `${API_URL}/api/orders`, or API_URL + '/api/orders'
  const call = new RegExp(
    `(?:fetch|axios\\.post|\\.post|\\$fetch)\\(\\s*(?:[\\w.]+\\s*\\+\\s*)?['"\`](?:\\$\\{[^}]*\\})?${escaped}['"\`]`,
  )
  for (const file of files) {
    const at = call.exec(file.text)
    if (!at) continue
    const open = file.text.indexOf('(', at.index)
    const args = file.text.slice(open, closeOf(file.text, open) + 1)
    const json = /JSON\.stringify\(\s*\{/.exec(args)
    const objectAt = json
      ? json.index + json[0].length - 1
      : args.indexOf('{', args.indexOf(',') + 1)
    if (objectAt <= 0) continue
    const entries = entriesOf(args, objectAt)
    if (entries.length === 0) continue
    const list = entries.find((entry) => entry.value.startsWith('['))
    const firstItem = list ? list.value.indexOf('{') : -1
    return {
      fields: entries.map((entry) => ({
        name: entry.key,
        value: placeholder(entry.key, PLACEHOLDER),
      })),
      line:
        list && firstItem !== -1
          ? entriesOf(list.value, firstItem).map((entry) => ({
              name: entry.key,
              value: placeholder(entry.key, LINE_PLACEHOLDER),
            }))
          : [],
    }
  }
  return undefined
}
