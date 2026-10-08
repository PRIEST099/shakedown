import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateConfig } from '../config'
import { discoverCommand } from './command'
import { configText, discover, discoverIn } from './index'
import { clientBodyOf } from './shape'
import { sourceOf } from './source'

const REPO = path.resolve(import.meta.dirname, '../../../..')

describe('discover, on Leaky Llama', () => {
  const found = discover(path.join(REPO, 'apps/leaky-llama'))

  it('finds every route the cast uses, at Shakedown’s own paths', () => {
    const best = found.picks.best
    expect(best.createOrder?.route).toMatchObject({ method: 'POST', path: '/api/checkout/orders' })
    expect(best.capture?.route).toMatchObject({ path: '/api/checkout/orders/:id/capture' })
    expect(best.webhook?.route.path).toBe('/api/paypal/webhook')
    expect(best.catalog?.route.path).toBe('/api/catalog')
    expect(best.probe?.route.path).toBe('/api/probe/orders/:id')
    expect(best.support?.route.path).toBe('/api/support/chat')
  })

  it('backs each with the line of code that gave it away', () => {
    const evidence = found.picks.best.createOrder?.evidence.find((e) => e.code)
    expect(evidence).toMatchObject({ file: 'lib/checkout.ts', says: 'creates a PayPal order' })
    expect(evidence?.code).toContain('createOrder(')
  })

  it('needs no route map, since the store already speaks the contract', () => {
    expect(found.map).toEqual({})
    expect(found.url).toBe('http://localhost:3100')
  })
})

describe('discover, on a store built like PayPal’s standard sample', () => {
  const found = discover(path.join(REPO, 'examples/standard-checkout'))

  it('finds its own routes', () => {
    expect(found.map.createOrder).toMatchObject({ method: 'POST', path: '/api/orders' })
    expect(found.map.capture).toMatchObject({ path: '/api/orders/:orderID/capture' })
    expect(found.map.webhook).toMatchObject({ path: '/webhooks/paypal' })
    expect(found.map.probe).toMatchObject({ path: '/shakedown/orders/:id' })
    expect(found.url).toBe('http://localhost:8888')
  })

  it('reads the cart’s shape and where PayPal’s order ID comes back', () => {
    expect(found.map.createOrder).toMatchObject({
      body: { cart: '{{lines}}' },
      line: { id: '{{sku}}', quantity: '{{qty}}', price: '{{unitPrice}}' },
      answer: { paypalOrderId: 'id' },
    })
  })

  it('reads a capture that hands PayPal’s answer straight back', () => {
    expect(found.map.capture?.answer).toEqual({
      status: 'status',
      captureId: 'purchase_units.0.payments.captures.0.id',
    })
  })

  it('reads its product list, fields and dollars included', () => {
    expect(found.map.catalog).toMatchObject({
      path: '/api/products',
      items: '',
      sku: 'id',
      name: 'title',
      price: 'price',
      priceUnit: 'dollars',
    })
  })

  it('writes a config that Shakedown itself accepts', () => {
    const text = configText(found, found.url, '2026-10-07')
    expect(text).toContain("import { defineConfig } from '@shakedown-dev/cli'")
    expect(() =>
      validateConfig({ target: { url: found.url, routes: found.map } }, 'test'),
    ).not.toThrow()
  })
})

describe('discover, across frameworks', () => {
  it('reads a Next.js pages-router checkout, with the order to capture in the body', () => {
    const found = discoverIn([
      sourceOf(
        'pages/api/paypal/create-order.ts',
        `export default async function handler(req, res) {
          if (req.method === 'POST') {
            const { cart } = req.body
            const r = await fetch(\`\${base}/v2/checkout/orders\`, { method: 'POST', body: JSON.stringify({ intent: 'CAPTURE' }) })
            const order = await r.json()
            res.status(200).json({ id: order.id })
          }
        }`,
      ),
      sourceOf(
        'pages/api/paypal/capture-order.ts',
        `export default async function handler(req, res) {
          if (req.method === 'POST') {
            const r = await fetch(\`\${base}/v2/checkout/orders/\${req.body.orderID}/capture\`, { method: 'POST' })
            res.status(200).json(await r.json())
          }
        }`,
      ),
    ])
    expect(found.map.createOrder).toMatchObject({
      method: 'POST',
      path: '/api/paypal/create-order',
    })
    expect(found.map.capture).toMatchObject({
      path: '/api/paypal/capture-order',
      body: { orderID: '{{paypalOrderId}}' },
    })
    expect(found.checks.join(' ')).not.toMatch(/takes no order in its path/)
  })

  it('reads a NestJS checkout that takes its price from the browser', () => {
    const found = discoverIn([
      sourceOf(
        'backend/src/paypal/paypal.controller.ts',
        `@Controller("paypal")
        export class PaypalController {
          constructor(private readonly paypalService: PaypalService) {}
          @Post("create-order")
          async createOrder(@Body("amount") amount: string) {
            return this.paypalService.createOrder(amount);
          }
          @Post("capture-order")
          async captureOrder(@Body("orderId") orderId: string) {
            return this.paypalService.captureOrder(orderId);
          }
        }`,
      ),
      sourceOf(
        'backend/src/paypal/paypal.service.ts',
        `@Injectable()
        export class PaypalService {
          async createOrder(amount: string) {
            const payload = { intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "EUR", value: amount } }] };
            const response = await axios.post(\`\${this.baseUrl}/v2/checkout/orders\`, payload, { headers });
            return response.data;
          }
          async captureOrder(orderId: string) {
            const response = await axios.post(\`\${this.baseUrl}/v2/checkout/orders/\${orderId}/capture\`, {}, { headers });
            return response.data;
          }
        }`,
      ),
      sourceOf(
        'frontend/src/components/Checkout.tsx',
        `const createOrder = async () => {
          const res = await axios.post(\`\${process.env.NEXT_PUBLIC_API_URL}/paypal/create-order\`, { amount: "100.00" });
          return res.data.id;
        };`,
      ),
    ])
    expect(found.map.createOrder).toMatchObject({
      path: '/paypal/create-order',
      body: { amount: '{{total}}' },
      answer: { paypalOrderId: 'id' },
    })
    expect(found.map.capture).toMatchObject({
      path: '/paypal/capture-order',
      body: { orderId: '{{paypalOrderId}}' },
      answer: { status: 'status' },
    })
    expect(found.risks.map((risk) => risk.title)).toContain(
      'POST /paypal/create-order takes its price from the request',
    )
  })

  it('says when the PayPal code is in a language it does not read', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'discover-'))
    writeFileSync(
      path.join(dir, 'server.py'),
      'from paypalserversdk.paypal_serversdk_client import PaypalServersdkClient\n',
    )
    const found = discover(dir)
    expect(found.checks[0]).toMatch(/JavaScript and TypeScript only.*Python \(server\.py\)/)
  })

  it("reads the body a page sends when the URL starts with the API's address", () => {
    const body = clientBodyOf(
      [
        sourceOf(
          'web/checkout.ts',
          `await axios.post(\`\${API}/paypal/create-order\`, { cart: [{ id: sku, quantity: 1 }] })`,
        ),
      ],
      '/paypal/create-order',
    )
    expect(body?.fields.map((f) => f.name)).toEqual(['cart'])
    expect(body?.line.map((f) => f.name)).toEqual(['id', 'quantity'])
  })

  it('reads SvelteKit routes, parameters included', () => {
    const found = discoverIn([
      sourceOf(
        'src/routes/api/orders/+server.ts',
        `export const POST = async ({ request }) => {
          const { items, email } = await request.json()
          return json(await paypal.createOrder({ intent: 'CAPTURE', purchase_units: [] }))
        }`,
      ),
      sourceOf(
        'src/routes/api/orders/[id]/capture/+server.ts',
        `export async function POST({ params }) {
          return json(await paypal.captureOrder(params.id))
        }`,
      ),
    ])
    expect(found.map.createOrder?.path).toBe('/api/orders')
    expect(found.map.createOrder?.body).toEqual({ items: '{{lines}}', email: '{{email}}' })
    expect(found.map.capture?.path).toBe('/api/orders/:id/capture')
  })

  it('follows an Express router to the prefix it is mounted under', () => {
    const found = discoverIn([
      sourceOf(
        'server.js',
        `import payments from './routes/payments.js'
         app.use('/api', payments)
         app.listen(4000)`,
      ),
      sourceOf(
        'routes/payments.js',
        `router.post('/orders', async (req, res) => {
           const order = await paypalClient.execute(new OrdersCreateRequest())
           res.json({ id: order.result.id })
         })
         router.post('/orders/:orderId/capture', async (req, res) => {
           res.json(await paypalClient.execute(new OrdersCaptureRequest(req.params.orderId)))
         })
         router.post('/paypal/webhook', async (req, res) => {
           if (req.body.event_type === 'PAYMENT.CAPTURE.COMPLETED') markPaid(req.body)
           res.sendStatus(200)
         })`,
      ),
    ])
    expect(found.map.createOrder?.path).toBe('/api/orders')
    expect(found.map.capture?.path).toBe('/api/orders/:orderId/capture')
    // At Shakedown's own default path, so the map leaves it out.
    expect(found.picks.best.webhook?.route.path).toBe('/api/paypal/webhook')
    expect(found.map.webhook).toBeUndefined()
  })

  it('reads a Worker that routes by hand, a regular-expression route included', () => {
    const found = discoverIn([
      sourceOf(
        'src/index.ts',
        `export default {
          async fetch(request: Request, env: Env): Promise<Response> {
            const path = new URL(request.url).pathname
            if (path === "/api/orders" && request.method === "POST") {
              const { items, customerEmail } = await request.json()
              return Response.json(await createPayPalOrder(env, total))
            }
            const captureMatch = path.match(/^\\/api\\/orders\\/([^/]+)\\/capture$/);
            if (captureMatch && request.method === "POST") {
              return Response.json(await capturePayPalOrder(env, captureMatch[1]))
            }
            return new Response('not found', { status: 404 })
          },
        }`,
      ),
      sourceOf(
        'src/paypal.ts',
        `export async function createPayPalOrder(env: Env, total: string): Promise<{ id: string }> {
          const res = await fetch(\`\${api}/v2/checkout/orders\`, { method: "POST" })
          return res.json()
        }
        export async function capturePayPalOrder(env: Env, id: string): Promise<{ status: string }> {
          const res = await fetch(\`\${api}/v2/checkout/orders/\${id}/capture\`, { method: "POST" })
          return res.json()
        }`,
      ),
    ])
    expect(found.picks.best.createOrder?.route.path).toBe('/api/orders')
    expect(found.picks.best.capture?.route.path).toBe('/api/orders/:id/capture')
    expect(found.map.createOrder?.body).toEqual({ items: '{{lines}}', customerEmail: '{{email}}' })
  })

  it('reads NestJS controllers', () => {
    const found = discoverIn([
      sourceOf(
        'src/payments.controller.ts',
        `@Controller('payments')
        export class PaymentsController {
          @Post('orders')
          async create(@Body() body: { cart: Line[] }) {
            return this.ordersController.createOrder({ body: { intent: 'CAPTURE' } })
          }
          @Post('orders/:id/capture')
          async capture(@Param('id') id: string) {
            return this.ordersController.captureOrder({ id })
          }
        }`,
      ),
    ])
    expect(found.picks.best.createOrder?.route.path).toBe('/payments/orders')
    expect(found.picks.best.capture?.route.path).toBe('/payments/orders/:id/capture')
  })

  it('reads the cart’s shape from how the store’s own page calls the route', () => {
    const found = discoverIn([
      sourceOf(
        'server/server.js',
        `app.post("/api/orders", async (req, res) => {
          const { cart } = req.body
          const { jsonResponse, httpStatusCode } = await createOrder(cart)
          res.status(httpStatusCode).json(jsonResponse)
        })
        const createOrder = async (cart) => ordersController.createOrder({ body: { intent: 'CAPTURE' } })`,
      ),
      sourceOf(
        'client/app.js',
        `const response = await fetch("/api/orders", {
          method: "POST",
          body: JSON.stringify({ cart: [{ id: "YOUR_PRODUCT_ID", quantity: "2" }] }),
        })`,
      ),
    ])
    expect(found.map.createOrder).toMatchObject({
      body: { cart: '{{lines}}' },
      line: { id: '{{sku}}', quantity: '{{qty}}' },
      answer: { paypalOrderId: 'id' },
    })
  })
})

describe('what discover flags as worth checking', () => {
  it('an order marked paid on the browser’s word, with the lines behind it', () => {
    const found = discoverIn([
      sourceOf('routes/orders.js', `router.route('/:id/pay').put(protect, updateOrderToPay)`),
      sourceOf(
        'server.js',
        `import orders from './routes/orders.js'\napp.use('/api/orders', orders)`,
      ),
      sourceOf(
        'controllers/orders.js',
        `const updateOrderToPay = asyncHandler(async (req, res) => {
          const order = await Order.findById(req.params.id)
          order.isPaid = true
          order.paymentResult = { id: req.body.id, status: req.body.status }
          res.json(await order.save())
        })`,
      ),
      sourceOf(
        'frontend/Pay.jsx',
        `onApprove={(data, actions) => actions.order.capture().then(pay)}`,
      ),
    ])
    const risk = found.risks.find((r) => /browser's word/.test(r.title))
    expect(risk?.title).toBe("PUT /api/orders/:id/pay marks an order paid on the browser's word")
    expect(risk?.evidence.map((e) => e.file)).toEqual([
      'controllers/orders.js',
      'controllers/orders.js',
      'frontend/Pay.jsx',
    ])
  })

  it('not when the route asks PayPal first', () => {
    const found = discoverIn([
      sourceOf(
        'routes/pay.js',
        `app.put('/api/orders/:id/pay', async (req, res) => {
          const paid = await ordersController.getOrder({ id: req.body.paypalOrderId })
          if (paid.result.status === 'COMPLETED') order.isPaid = true
        })`,
      ),
    ])
    expect(found.risks.filter((r) => /browser's word/.test(r.title))).toEqual([])
  })

  it('a checkout without an idempotency key, and a listener that never verifies', () => {
    const found = discover(path.join(REPO, 'examples/standard-checkout'))
    const titles = found.risks.map((r) => r.title)
    expect(titles).toContain('POST /api/orders sends no idempotency key')
    expect(titles).toContain('POST /webhooks/paypal never asks PayPal to verify a signature')
  })

  it('a POST route at a PayPal webhook path counts as the listener, even with no signals inside', () => {
    const found = discoverIn([
      sourceOf(
        'server.js',
        `app.post('/api/orders', async (req, res) => res.json(await ordersController.createOrder({})))
         app.post('/api/orders/:id/capture', async (req, res) => res.json(await ordersController.captureOrder({})))
         app.post('/webhooks/paypal', async (req, res) => { handle(req.body); res.sendStatus(200) })`,
      ),
    ])
    expect(found.map.webhook?.path).toBe('/webhooks/paypal')
    expect(found.cast).toBeUndefined()
  })

  it('PayPal’s older v1 Payments API, which the cast doesn’t test', () => {
    const found = discoverIn([
      sourceOf(
        'lib/paypal.js',
        `const paypal = require('paypal-rest-sdk')\npaypal.payment.create(payment, cb)`,
      ),
    ])
    expect(found.risks[0]?.title).toMatch(/older v1 Payments API/)
  })

  it('leaves the Echo out of the cast when there is no webhook listener', () => {
    const found = discover(path.join(REPO, 'examples/standard-checkout'))
    expect(found.cast).toBeUndefined()
    const noHook = discoverIn([
      sourceOf(
        'server.js',
        `app.post('/api/orders', async (req, res) => res.json(await ordersController.createOrder({})))
         app.post('/api/orders/:id/capture', async (req, res) => res.json(await ordersController.captureOrder({})))`,
      ),
    ])
    expect(noHook.cast).toEqual(['double-clicker', 'cart-shuffler', 'bouncer'])
  })
})

describe('discover, when there is nothing to find', () => {
  it('says so when there is no checkout to find', () => {
    const found = discoverIn([sourceOf('index.js', 'console.log("hello")')])
    expect(found.picks.best.createOrder).toBeUndefined()
    expect(found.checks[0]).toMatch(/No route that creates a PayPal order/)
  })
})

describe('the discover command', () => {
  const quiet = { log: () => {}, today: '2026-10-07' }

  it('writes shakedown.config.ts, and never over an existing config', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'discover-'))
    const store = readFileSync(path.join(REPO, 'examples/standard-checkout/server.mjs'), 'utf8')
    writeFileSync(path.join(dir, 'server.mjs'), store)
    expect(discoverCommand(dir, { write: true }, quiet)).toBe(0)
    expect(readFileSync(path.join(dir, 'shakedown.config.ts'), 'utf8')).toContain(
      "path: '/api/orders'",
    )
    writeFileSync(path.join(dir, 'shakedown.config.ts'), 'mine')
    discoverCommand(dir, { write: true }, quiet)
    expect(readFileSync(path.join(dir, 'shakedown.config.ts'), 'utf8')).toBe('mine')
    expect(readFileSync(path.join(dir, 'shakedown.config.discovered.ts'), 'utf8')).toContain(
      '/api/orders',
    )
  })

  it('exits non-zero when it finds no checkout', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'discover-'))
    expect(discoverCommand(dir, {}, quiet)).not.toBe(0)
  })
})
