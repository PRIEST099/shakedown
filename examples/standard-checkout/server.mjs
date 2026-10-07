/**
 * Trailhead Outfitters: a second demo store, built the way most PayPal integrations start, from
 * the shape of PayPal's standard checkout sample. Its routes are its own, not Shakedown's
 * contract: `POST /api/orders` with a `cart`, `POST /api/orders/:orderID/capture` passing PayPal's
 * answer straight back, a product list in dollars, a webhook at `/webhooks/paypal`. It is here to
 * show that `shakedown discover` finds a checkout it was not written for.
 *
 * Like Leaky Llama, it keeps a few classic mistakes on purpose, marked LEAK below. PayPal
 * sandbox only, and no dependencies:
 *
 *   node --env-file=../../.env.local server.mjs     # http://localhost:8888
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8888)
const PAYPAL_API = 'https://api-m.sandbox.paypal.com'
if ((process.env.PAYPAL_ENV ?? 'sandbox') !== 'sandbox') {
  throw new Error('Trailhead Outfitters runs against the PayPal sandbox only.')
}

const PRODUCTS = [
  { id: 'mug', title: 'Enamel camp mug', price: '12.00' },
  { id: 'lantern', title: 'Collapsible lantern', price: '29.00' },
  { id: 'tarp', title: 'Ripstop tarp, 3 × 3 m', price: '64.00' },
]
const priceOf = (id) => PRODUCTS.find((p) => p.id === id)?.price

/** Orders by PayPal order ID: what was bought, and everything that happened to it since. */
const orders = new Map()

// ---------- PayPal ----------

async function accessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString('base64')
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: { Authorization: `Basic ${auth}` },
  })
  return (await res.json()).access_token
}

async function paypal(method, path, body) {
  const res = await fetch(`${PAYPAL_API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { jsonResponse: await res.json(), httpStatusCode: res.status }
}

/** Open a PayPal order for the cart. */
async function createOrder(cart) {
  // LEAK: the price comes from the browser when it sends one.
  const items = cart.map((item) => ({
    id: item.id,
    quantity: Number(item.quantity),
    price: item.price ?? priceOf(item.id),
  }))
  const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const value = total.toFixed(2)
  const order = await paypal('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'USD', value } }],
  })
  if (order.jsonResponse.id) {
    orders.set(order.jsonResponse.id, {
      items,
      amountCents: Math.round(total * 100),
      status: 'awaiting_payment',
      captureId: null,
      capturedCents: 0,
      shipments: [],
      webhooks: [],
      refunds: [],
    })
  }
  return order
}

/** Capture an approved order. */
async function captureOrder(orderID) {
  return paypal('POST', `/v2/checkout/orders/${orderID}/capture`)
}

// ---------- the warehouse ----------

/** What a list of items is worth at the shop's own prices, in cents. */
const worth = (items) =>
  items.reduce(
    (sum, item) => sum + Math.round(Number(priceOf(item.id) ?? 0) * 100) * item.quantity,
    0,
  )

function ship(order, source) {
  order.status = 'fulfilled'
  order.shipments.push({ source, valueCents: worth(order.items) })
}

// ---------- routes ----------

const routes = []
const app = {
  get: (path, handler) => routes.push({ method: 'GET', path, handler }),
  post: (path, handler) => routes.push({ method: 'POST', path, handler }),
}

app.get('/api/products', async (_req, res) => {
  res.json(PRODUCTS)
})

app.post('/api/orders', async (req, res) => {
  // LEAK: no idempotency key, so a second press opens a second order.
  const { cart } = req.body
  const { jsonResponse, httpStatusCode } = await createOrder(cart)
  res.status(httpStatusCode).json(jsonResponse)
})

app.post('/api/orders/:orderID/capture', async (req, res) => {
  const { orderID } = req.params
  const { jsonResponse, httpStatusCode } = await captureOrder(orderID)
  const order = orders.get(orderID)
  // LEAK: believes the order's status, not the capture's: a declined card can still read COMPLETED.
  if (order && jsonResponse.status === 'COMPLETED') {
    const capture = jsonResponse.purchase_units?.[0]?.payments?.captures?.[0]
    order.captureId = capture?.id ?? null
    order.capturedCents = Math.round(Number(capture?.amount?.value ?? 0) * 100)
    ship(order, 'checkout')
  }
  res.status(httpStatusCode).json(jsonResponse)
})

app.post('/webhooks/paypal', async (req, res) => {
  // LEAK: never asks PayPal to verify the signature, and acts on every copy of an event.
  const event = req.body
  const resource = event.resource ?? {}
  const ref = resource.custom_id ?? resource.supplementary_data?.related_ids?.order_id
  const order =
    orders.get(ref) ?? [...orders.values()].find((entry) => entry.captureId === resource.id)
  if (!order) return res.status(200).json({ ok: true })
  order.webhooks.push({ eventId: event.id, outcome: 'applied' })
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    order.capturedCents = Math.round(Number(resource.amount?.value ?? 0) * 100)
    ship(order, 'webhook')
  }
  if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') order.status = 'refunded'
  res.status(200).json({ ok: true })
})

// Shakedown's read-only probe: what this store believes about an order.
app.get('/shakedown/orders/:id', async (req, res) => {
  if (req.headers['x-shakedown-probe'] !== process.env.SHAKEDOWN_PROBE_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' })
  }
  const order = orders.get(req.params.id)
  if (!order) return res.status(404).json({ orderId: req.params.id, found: false })
  res.json({
    orderId: req.params.id,
    found: true,
    status: order.status,
    fulfillmentCount: order.shipments.length,
    amountCents: order.amountCents,
    currency: 'USD',
    paypalOrderId: req.params.id,
    captureId: order.captureId,
    capturedCents: order.capturedCents,
    shipments: order.shipments,
    webhooks: order.webhooks,
    refunds: order.refunds,
  })
})

// ---------- a very small router, so the store needs nothing installed ----------

function match(pattern, path) {
  const a = pattern.split('/')
  const b = path.split('/')
  if (a.length !== b.length) return undefined
  const params = {}
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return undefined
  }
  return params
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let raw = ''
  for await (const chunk of req) raw += chunk
  let status = 200
  const reply = {
    status(code) {
      status = code
      return reply
    },
    json(value) {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    },
  }
  for (const route of routes) {
    const params = route.method === req.method ? match(route.path, url.pathname) : undefined
    if (!params) continue
    try {
      const body = raw ? JSON.parse(raw) : {}
      await route.handler({ params, body, headers: req.headers }, reply)
    } catch (error) {
      reply.status(500).json({ error: String(error?.message ?? error) })
    }
    return
  }
  reply.status(404).json({ error: 'Not found.' })
}).listen(PORT, () =>
  console.log(`Trailhead Outfitters on http://localhost:${PORT} (PayPal sandbox)`),
)
