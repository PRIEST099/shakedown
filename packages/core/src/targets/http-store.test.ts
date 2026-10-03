import { describe, expect, it } from 'vitest'
import { CAMPAIGN_HEADER } from '../campaign-token'
import { TargetNotAllowedError } from '../guards'
import { captureCompleted } from '../webhook'
import { httpStoreTarget, PROBE_HEADER } from './http-store'

interface Seen {
  url: string
  method: string
  headers: Headers
  body?: string
}

/** A stand-in store that records every request and answers like Leaky Llama's routes. */
function stubStore() {
  const seen: Seen[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    seen.push({
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body as string,
    })
    const path = new URL(url).pathname
    if (path === '/api/catalog') {
      return Response.json({ items: [{ sku: 'LL-BTL-750', name: 'Bottle', priceCents: 3600 }] })
    }
    if (path === '/api/checkout/orders') {
      return Response.json(
        {
          orderId: 'PP-1',
          orderNumber: 'LL-10001',
          paypalOrderId: 'PP-1',
          amountCents: 3600,
          currency: 'USD',
          reused: false,
        },
        { status: 201 },
      )
    }
    if (path.endsWith('/capture')) {
      return Response.json(
        { kind: 'declined', orderNumber: 'LL-10001', reason: 'The payment did not go through.' },
        { status: 402 },
      )
    }
    if (path === '/api/paypal/webhook') return Response.json({ outcome: 'applied' })
    if (path.startsWith('/api/probe/orders/')) {
      return Response.json({
        orderId: 'LL-10001',
        found: true,
        status: 'fulfilled',
        fulfillmentCount: 2,
        amountCents: 3600,
        currency: 'USD',
        paypalOrderId: 'PP-1',
        captureId: 'CAP-1',
        capturedCents: 3600,
        shipments: [{ id: 1, source: 'checkout', valueCents: 3600, items: [], at: 'x' }],
        webhooks: [{ deliveryId: 1, eventId: 'WH-1', outcome: 'applied', verification: 'skipped' }],
        refunds: [],
        mode: {},
      })
    }
    return new Response('not found', { status: 404 })
  }
  return { fetch: fetch as typeof globalThis.fetch, seen }
}

const make = (overrides: Partial<Parameters<typeof httpStoreTarget>[0]> = {}) => {
  const store = stubStore()
  return {
    store,
    target: httpStoreTarget({
      baseUrl: 'http://localhost:3100',
      probeSecret: 'probe-secret-for-tests',
      campaignToken: 'v1.token.sig',
      fetch: store.fetch,
      ...overrides,
    }),
  }
}

describe('httpStoreTarget', () => {
  it('refuses a public store that has not proven who owns it, before sending anything', async () => {
    const store = stubStore()
    await expect(
      httpStoreTarget({
        baseUrl: 'https://shop.example.com',
        probeSecret: 'x',
        fetch: store.fetch,
      }),
    ).rejects.toThrow(TargetNotAllowedError)
    expect(store.seen).toHaveLength(0)
  })

  it('reads the catalog and walks the checkout with the campaign token attached', async () => {
    const { store, target } = make()
    const resolved = await target
    expect(resolved.checkout?.catalog).toEqual([
      { sku: 'LL-BTL-750', name: 'Bottle', priceCents: 3600 },
    ])

    const opened = await resolved.checkout?.openCheckout({
      lines: [{ sku: 'LL-BTL-750', qty: 1 }],
      email: 'c@example.com',
      checkoutKey: 'CK-1',
    })
    expect(opened).toMatchObject({
      status: 201,
      storeOrderId: 'LL-10001',
      paypalOrderId: 'PP-1',
      amountCents: 3600,
    })

    const answer = await resolved.checkout?.capture('PP-1', {
      lines: [{ sku: 'LL-BTL-750', qty: 2 }],
    })
    expect(answer).toMatchObject({ status: 402, kind: 'declined', storeOrderId: 'LL-10001' })

    const writes = store.seen.filter((request) => request.method === 'POST')
    expect(writes.every((request) => request.headers.get(CAMPAIGN_HEADER) === 'v1.token.sig')).toBe(
      true,
    )
    expect(JSON.parse(writes[1]?.body ?? '{}')).toEqual({ lines: [{ sku: 'LL-BTL-750', qty: 2 }] })
  })

  it('never claims a signature it could not make', async () => {
    const { target } = make()
    const event = captureCompleted({
      id: 'WH-1',
      orderId: 'LL-10001',
      captureId: 'CAP-1',
      amountCents: 3600,
      createTime: new Date(),
    })
    const result = await (await target).deliverWebhook(event, { signed: true })
    expect(result).toMatchObject({ signed: false, accepted: true })
  })

  it('reads the probe with the shared secret and keeps shipments and deliveries', async () => {
    const { store, target } = make()
    const state = await (await target).probeOrder('LL-10001')
    expect(state).toMatchObject({
      found: true,
      fulfillmentCount: 2,
      captureId: 'CAP-1',
      shipments: [{ source: 'checkout', valueCents: 3600 }],
      deliveries: [{ eventId: 'WH-1', outcome: 'applied' }],
    })
    expect(state).not.toHaveProperty('mode')
    const probe = store.seen.find((request) => request.url.includes('/api/probe/'))
    expect(probe?.headers.get(PROBE_HEADER)).toBe('probe-secret-for-tests')
    expect(probe?.headers.get(CAMPAIGN_HEADER)).toBeNull()
  })
})
