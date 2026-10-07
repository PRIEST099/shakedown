import { describe, expect, it } from 'vitest'
import { httpStoreTarget } from './http-store'
import {
  centsOf,
  DEFAULT_ROUTES,
  fillPath,
  pick,
  type RouteMap,
  render,
  resolveRoutes,
} from './routes'

describe('route templates', () => {
  it('keep a value’s own type when a string is only a placeholder', () => {
    expect(render({ cart: '{{lines}}', n: '{{qty}}' }, { lines: [{ id: 'A' }], qty: 2 })).toEqual({
      cart: [{ id: 'A' }],
      n: 2,
    })
  })

  it('write placeholders inside longer strings as text', () => {
    expect(render('order {{sku}} × {{qty}}', { sku: 'A', qty: 2 })).toBe('order A × 2')
  })

  it('leave out a field whose value is not there, so it is not sent', () => {
    expect(render({ sku: '{{sku}}', unitCents: '{{unitCents}}' }, { sku: 'A' })).toEqual({
      sku: 'A',
    })
  })
})

describe('dot paths', () => {
  const capture = {
    status: 'COMPLETED',
    purchase_units: [{ payments: { captures: [{ id: 'C-1' }] } }],
  }

  it('read nested fields and list items', () => {
    expect(pick(capture, 'purchase_units.0.payments.captures.0.id')).toBe('C-1')
  })

  it('try each of a|b in turn', () => {
    expect(pick({ orderId: 'P-1' }, 'paypalOrderId|orderId')).toBe('P-1')
  })

  it('read the value itself for an empty path, and nothing for a missing one', () => {
    expect(pick([1, 2], '')).toEqual([1, 2])
    expect(pick({}, 'a.b')).toBeUndefined()
  })
})

describe('paths and money', () => {
  it('fill the first :param or [param] of a path', () => {
    expect(fillPath('/api/orders/:orderID/capture', 'P 1')).toBe('/api/orders/P%201/capture')
    expect(fillPath('/api/orders/[id]/capture', 'P1')).toBe('/api/orders/P1/capture')
  })

  it('read prices in cents or dollars', () => {
    expect(centsOf(1800)).toBe(1800)
    expect(centsOf('18.00', 'dollars')).toBe(1800)
    expect(centsOf(18.5, 'dollars')).toBe(1850)
    expect(centsOf('free', 'dollars')).toBeUndefined()
  })

  it('fill in what a route map leaves out from Shakedown’s own contract', () => {
    const routes = resolveRoutes({ capture: { path: '/api/orders/:orderID/capture' } })
    expect(routes.capture.method).toBe('POST')
    expect(routes.capture.answer.captureId).toBe(DEFAULT_ROUTES.capture.answer.captureId)
    expect(routes.createOrder.path).toBe('/api/checkout/orders')
  })
})

/**
 * A store built the way PayPal's standard integration sample is: no catalog route, `POST
 * /api/orders` with a `cart`, answering with PayPal's own order, and a capture route that passes
 * PayPal's answer through.
 */
function paypalSampleStore() {
  const seen: { method: string; path: string; headers: Headers; body?: unknown }[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    seen.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    if (url.pathname === '/api/orders') {
      return Response.json({ id: 'PP-77', status: 'CREATED' }, { status: 201 })
    }
    if (url.pathname === '/api/orders/PP-77/capture') {
      return Response.json({
        id: 'PP-77',
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'CAP-9', status: 'COMPLETED' }] } }],
      })
    }
    if (url.pathname === '/webhooks/paypal') return new Response('ok')
    return new Response('not found', { status: 404 })
  }
  return { seen, fetch: fetch as typeof globalThis.fetch }
}

const SAMPLE_ROUTES: RouteMap = {
  catalog: false,
  createOrder: {
    path: '/api/orders',
    headers: { 'PayPal-Request-Id': '{{checkoutKey}}' },
    body: { cart: '{{lines}}' },
    line: { id: '{{sku}}', quantity: '{{qty}}' },
    answer: { paypalOrderId: 'id' },
  },
  capture: {
    path: '/api/orders/:orderID/capture',
    body: {},
    answer: { status: 'status', captureId: 'purchase_units.0.payments.captures.0.id' },
  },
  webhook: { path: '/webhooks/paypal' },
}

describe('a store with routes of its own', () => {
  const connect = (fetch: typeof globalThis.fetch) =>
    httpStoreTarget({
      baseUrl: 'http://localhost:8888',
      probeSecret: 'x'.repeat(16),
      fetch,
      routes: SAMPLE_ROUTES,
      catalog: [{ sku: 'GUIDE', name: 'Field guide', priceCents: 2400 }],
    })

  it('opens a checkout at its route, in its shape, and finds PayPal’s order ID in its answer', async () => {
    const store = paypalSampleStore()
    const target = await connect(store.fetch)
    const opened = await target.checkout?.openCheckout({
      lines: [{ sku: 'GUIDE', qty: 2 }],
      email: 'a@example.com',
      checkoutKey: 'CK-1',
    })
    // It keeps no order number of its own, so its orders are known by PayPal's order ID.
    expect(opened).toMatchObject({ status: 201, paypalOrderId: 'PP-77', storeOrderId: 'PP-77' })
    const sent = store.seen.at(-1)
    expect(sent).toMatchObject({ method: 'POST', path: '/api/orders' })
    expect(sent?.body).toEqual({ cart: [{ id: 'GUIDE', quantity: 2 }] })
    expect(sent?.headers.get('PayPal-Request-Id')).toBe('CK-1')
  })

  it('reads a capture that passes PayPal’s answer through as paid, with its capture ID', async () => {
    const store = paypalSampleStore()
    const target = await connect(store.fetch)
    const answer = await target.checkout?.capture('PP-77')
    expect(answer).toMatchObject({ status: 200, kind: 'paid', captureId: 'CAP-9' })
    expect(store.seen.at(-1)?.path).toBe('/api/orders/PP-77/capture')
  })

  it('delivers webhooks to its own listener, unsigned', async () => {
    const store = paypalSampleStore()
    const target = await connect(store.fetch)
    const result = await target.deliverWebhook({
      id: 'WH-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      create_time: '2026-10-07T00:00:00Z',
      resource: { id: 'CAP-9' },
    })
    expect(result).toMatchObject({ status: 200, accepted: true, signed: false })
    expect(store.seen.at(-1)?.path).toBe('/webhooks/paypal')
  })

  it('reads a catalog from its own route, with prices in dollars', async () => {
    const fetch = (async () =>
      Response.json({
        products: [{ id: 'SOCK', title: 'Socks', price: '18.00' }],
      })) as unknown as typeof globalThis.fetch
    const target = await httpStoreTarget({
      baseUrl: 'http://localhost:8888',
      probeSecret: 'x'.repeat(16),
      fetch,
      routes: {
        catalog: {
          path: '/products',
          items: 'products',
          sku: 'id',
          name: 'title',
          price: 'price',
          priceUnit: 'dollars',
        },
      },
    })
    expect(target.checkout?.catalog).toEqual([{ sku: 'SOCK', name: 'Socks', priceCents: 1800 }])
  })

  it('says how to go on when a store has no catalog route and the config gives none', async () => {
    const store = paypalSampleStore()
    await expect(
      httpStoreTarget({
        baseUrl: 'http://localhost:8888',
        probeSecret: 'x'.repeat(16),
        fetch: store.fetch,
        routes: SAMPLE_ROUTES,
      }),
    ).rejects.toThrow(/target\.catalog/)
  })
})
