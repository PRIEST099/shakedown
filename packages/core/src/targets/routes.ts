/**
 * Where a store's checkout lives, and how it talks. Every store names its routes and shapes its
 * requests differently: PayPal's own sample answers `POST /api/orders` with PayPal's order, Leaky
 * Llama answers `POST /api/checkout/orders` with its own. A route map says, per route, the method
 * and path, the JSON body to send (a template with {{placeholders}}), and where the fields
 * Shakedown needs sit in the answer (dot paths, `a|b` for either). Anything left out falls back to
 * Shakedown's own contract, which is what Leaky Llama speaks.
 *
 * `shakedown discover` writes one of these from a store's source code.
 */

/** A JSON value with {{placeholders}} in its strings. */
export type Template = string | number | boolean | null | Template[] | { [key: string]: Template }

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH'

export interface RouteSpec {
  method?: Method
  /** The path on the store, e.g. `/api/orders/:orderID/capture`. Its first `:param` is filled in. */
  path: string
  /** Extra request headers, e.g. `{ 'Idempotency-Key': '{{checkoutKey}}' }`. */
  headers?: Record<string, string>
}

/**
 * Opening a checkout. Body placeholders: {{lines}}, {{email}}, {{checkoutKey}}, {{totalCents}},
 * {{total}} (dollars, e.g. "24.00") and {{currency}}. Each cart line is written with `line`, whose
 * placeholders are {{sku}}, {{qty}}, {{unitCents}}, {{unitPrice}} (dollars) and {{name}}.
 */
export interface CreateOrderRoute extends RouteSpec {
  body?: Template
  line?: Template
  answer?: {
    paypalOrderId?: string
    storeOrderId?: string
    amountCents?: string
    /** The amount in dollars, when the store answers that instead of cents. */
    amount?: string
    currency?: string
    reused?: string
    error?: string
  }
}

/** Capturing an approved order. Its path's first `:param` is the PayPal order ID. */
export interface CaptureRoute extends RouteSpec {
  body?: Template
  line?: Template
  answer?: {
    /** The store's own verdict, e.g. 'paid'. */
    kind?: string
    /** A PayPal status instead, e.g. COMPLETED, when the store passes PayPal's answer through. */
    status?: string
    storeOrderId?: string
    captureId?: string
    shipped?: string
    error?: string
  }
}

/** What the store sells. Without one, give `target.catalog` in the config. */
export interface CatalogRoute extends RouteSpec {
  /** Where the list is in the answer. Empty when the answer is the list itself. */
  items?: string
  sku?: string
  name?: string
  price?: string
  /** Whether `price` is in cents (1800) or dollars (18 or "18.00"). */
  priceUnit?: 'cents' | 'dollars'
}

/** The support assistant. Body placeholder: {{messages}}, the conversation so far. */
export interface SupportRoute extends RouteSpec {
  body?: Template
  answer?: { reply?: string; toolCalls?: string; error?: string }
}

export interface RouteMap {
  catalog?: CatalogRoute | false
  createOrder?: CreateOrderRoute
  capture?: CaptureRoute
  webhook?: RouteSpec
  /** Shakedown's read-only probe: what the store believes about an order. Its `:param` is the order. */
  probe?: RouteSpec
  support?: SupportRoute | false
}

/** Shakedown's own contract: Leaky Llama's routes. */
export const DEFAULT_ROUTES = {
  catalog: {
    method: 'GET',
    path: '/api/catalog',
    items: 'items',
    sku: 'sku',
    name: 'name',
    price: 'priceCents',
    priceUnit: 'cents',
  },
  createOrder: {
    method: 'POST',
    path: '/api/checkout/orders',
    body: { lines: '{{lines}}', email: '{{email}}', checkoutKey: '{{checkoutKey}}' },
    line: { sku: '{{sku}}', qty: '{{qty}}', unitCents: '{{unitCents}}' },
    answer: {
      paypalOrderId: 'paypalOrderId|orderId',
      storeOrderId: 'orderNumber',
      amountCents: 'amountCents',
      currency: 'currency',
      reused: 'reused',
      error: 'error',
    },
  },
  capture: {
    method: 'POST',
    path: '/api/checkout/orders/:paypalOrderId/capture',
    body: { lines: '{{lines}}' },
    line: { sku: '{{sku}}', qty: '{{qty}}', unitCents: '{{unitCents}}' },
    answer: {
      kind: 'kind',
      storeOrderId: 'orderNumber',
      captureId: 'captureId',
      shipped: 'shipped',
      error: 'error|reason',
    },
  },
  webhook: { method: 'POST', path: '/api/paypal/webhook' },
  probe: { method: 'GET', path: '/api/probe/orders/:orderId' },
  support: {
    method: 'POST',
    path: '/api/support/chat',
    body: { messages: '{{messages}}' },
    answer: { reply: 'reply', toolCalls: 'toolCalls', error: 'error' },
  },
} as const satisfies Required<RouteMap>

/** A route map with every part filled in from the defaults, route by route and field by field. */
export function resolveRoutes(routes: RouteMap = {}) {
  const merge = <T extends object>(base: T, over: Partial<T> | undefined): T =>
    over ? ({ ...base, ...over } as T) : base
  const createOrder = merge<CreateOrderRoute>(DEFAULT_ROUTES.createOrder, routes.createOrder)
  const capture = merge<CaptureRoute>(DEFAULT_ROUTES.capture, routes.capture)
  return {
    catalog:
      routes.catalog === false
        ? (false as const)
        : merge<CatalogRoute>(DEFAULT_ROUTES.catalog, routes.catalog),
    createOrder: {
      ...createOrder,
      answer: { ...DEFAULT_ROUTES.createOrder.answer, ...routes.createOrder?.answer },
    },
    capture: {
      ...capture,
      answer: { ...DEFAULT_ROUTES.capture.answer, ...routes.capture?.answer },
    },
    webhook: merge<RouteSpec>(DEFAULT_ROUTES.webhook, routes.webhook),
    probe: merge<RouteSpec>(DEFAULT_ROUTES.probe, routes.probe),
    support:
      routes.support === false
        ? (false as const)
        : merge<SupportRoute>(DEFAULT_ROUTES.support, routes.support),
  }
}

export type ResolvedRoutes = ReturnType<typeof resolveRoutes>

const WHOLE = /^\{\{\s*([\w.]+)\s*\}\}$/
const INSIDE = /\{\{\s*([\w.]+)\s*\}\}/g

/**
 * A template filled in. A string that is only a placeholder takes the value's own type (a list
 * stays a list, a number a number); placeholders inside longer strings are written as text. A
 * field whose value is undefined is left out, so an optional field is simply not sent.
 */
export function render(template: Template | undefined, vars: Record<string, unknown>): unknown {
  if (template === undefined) return undefined
  if (typeof template === 'string') {
    const whole = WHOLE.exec(template)
    if (whole) return vars[whole[1] ?? '']
    return template.replace(INSIDE, (_, name: string) => {
      const value = vars[name]
      return value === undefined || value === null ? '' : String(value)
    })
  }
  if (Array.isArray(template)) return template.map((item) => render(item, vars))
  if (template && typeof template === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(template)) {
      const filled = render(value, vars)
      if (filled !== undefined) out[key] = filled
    }
    return out
  }
  return template
}

/**
 * The value at a dot path, e.g. `purchase_units.0.payments.captures.0.id`. `a|b` tries each in
 * turn; an empty path is the value itself.
 */
export function pick(value: unknown, path: string | undefined): unknown {
  if (path === undefined) return undefined
  for (const option of path.split('|')) {
    let at: unknown = value
    for (const key of option.split('.').filter(Boolean)) {
      if (at === null || typeof at !== 'object') {
        at = undefined
        break
      }
      at = (at as Record<string, unknown>)[key]
    }
    if (at !== undefined && at !== null) return at
  }
  return undefined
}

/** A path with its first `:param` (or `[param]`) filled in. */
export function fillPath(path: string, value: string): string {
  return path.replace(/:[A-Za-z_]\w*|\[[^\]]+\]/, encodeURIComponent(value))
}

/** Dollars to cents, from a number (18, 18.5) or a decimal string ("18.00"). */
export function centsOf(value: unknown, unit: 'cents' | 'dollars' = 'cents'): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return undefined
  return unit === 'cents' ? Math.round(n) : Math.round(n * 100)
}

/** Cents as a dollars string, "24.00". */
export const dollarsOf = (cents: number) => (cents / 100).toFixed(2)
