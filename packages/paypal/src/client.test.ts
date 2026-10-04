import { describe, expect, it } from 'vitest'
import { authAssertion, PayPalSandboxClient } from './client'
import { PayPalApiError } from './errors'
import { SandboxLockError } from './sandbox-lock'

type Call = { url: string; init: RequestInit }

function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next()
  }) as typeof fetch
  return { fn, calls }
}

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })

const token = json(200, { access_token: 'token-abc', expires_in: 32400 })
const creds = { clientId: 'client-id', clientSecret: 'client-secret-value' }
const header = (call: Call | undefined, name: string) =>
  (call?.init.headers as Record<string, string> | undefined)?.[name]

describe('PayPalSandboxClient', () => {
  it('fetches a token once and reuses it', async () => {
    const { fn, calls } = fakeFetch([token, json(200, { id: 'O-1' }), json(200, { id: 'O-1' })])
    const client = new PayPalSandboxClient(creds, { fetch: fn })
    await client.request('GET', '/v2/checkout/orders/O-1')
    await client.request('GET', '/v2/checkout/orders/O-1')
    expect(calls.filter((c) => c.url.endsWith('/v1/oauth2/token'))).toHaveLength(1)
    expect(header(calls[1], 'Authorization')).toBe('Bearer token-abc')
  })

  it('gives every write its own PayPal-Request-Id, unless one is supplied', async () => {
    const { fn, calls } = fakeFetch([token, json(201, {}), json(201, {}), json(201, {})])
    const client = new PayPalSandboxClient(creds, { fetch: fn })
    const a = await client.request('POST', '/v2/checkout/orders', { body: {} })
    const b = await client.request('POST', '/v2/checkout/orders/X/capture', { body: {} })
    const c = await client.request('POST', '/v2/checkout/orders', {
      body: {},
      requestId: 'fixed-1',
    })
    expect(a.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(b.requestId).not.toBe(a.requestId)
    expect(c.requestId).toBe('fixed-1')
    expect(header(calls[3], 'PayPal-Request-Id')).toBe('fixed-1')
  })

  it('sends negative-testing and auth-assertion headers when asked', async () => {
    const { fn, calls } = fakeFetch([token, json(201, {})])
    const client = new PayPalSandboxClient(creds, { fetch: fn })
    await client.request('POST', '/v2/checkout/orders/X/capture', {
      mock: 'INSTRUMENT_DECLINED',
      authAssertion: 'a.b.',
    })
    expect(header(calls[1], 'PayPal-Mock-Response')).toBe(
      '{"mock_application_codes":"INSTRUMENT_DECLINED"}',
    )
    expect(header(calls[1], 'PayPal-Auth-Assertion')).toBe('a.b.')
  })

  it('sends a raw JSON body byte for byte', async () => {
    const { fn, calls } = fakeFetch([token, json(200, { verification_status: 'SUCCESS' })])
    const client = new PayPalSandboxClient(creds, { fetch: fn })
    const raw = '{"webhook_event":{"id":"WH-1","resource":{"amount":"12.00"}},"z":1,"a":2}'
    await client.request('POST', '/v1/notifications/verify-webhook-signature', { rawJson: raw })
    expect(calls[1]?.init.body).toBe(raw)
    expect(header(calls[1], 'Content-Type')).toBe('application/json')
  })

  it('turns PayPal errors into PayPalApiError without leaking credentials', async () => {
    const { fn } = fakeFetch([
      token,
      json(
        422,
        {
          name: 'UNPROCESSABLE_ENTITY',
          message: 'The requested action could not be performed.',
          debug_id: 'dbg-123',
          details: [{ issue: 'INSTRUMENT_DECLINED', description: 'declined' }],
        },
        { 'paypal-debug-id': 'dbg-123' },
      ),
    ])
    const client = new PayPalSandboxClient(creds, { fetch: fn })
    const error = await client.request('POST', '/v2/checkout/orders/X/capture').catch((e) => e)
    expect(error).toBeInstanceOf(PayPalApiError)
    expect(error).toMatchObject({ status: 422, issue: 'INSTRUMENT_DECLINED', debugId: 'dbg-123' })
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(
      'client-secret-value',
    )
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain('token-abc')
  })

  it('cannot be pointed at a live host', async () => {
    const { fn } = fakeFetch([token])
    const client = new PayPalSandboxClient(creds, { fetch: fn })
    await expect(
      client.request('GET', 'https://api-m.paypal.com/v2/checkout/orders/X'),
    ).rejects.toThrow(SandboxLockError)
  })
})

describe('PayPalApiError', () => {
  it('is recognised even when its module was loaded twice', async () => {
    // What a second copy of this module would throw: a different class, the same shape.
    const copy = await import(`./errors?copy=${Date.now()}`)
    const error = new copy.PayPalApiError({
      status: 422,
      message: 'x',
      issue: 'ORDER_ALREADY_CAPTURED',
    })
    expect(copy.PayPalApiError).not.toBe(PayPalApiError)
    expect(error instanceof PayPalApiError).toBe(true)
    expect(new Error('x') instanceof PayPalApiError).toBe(false)
    expect(
      Object.assign(new Error('x'), { name: 'PayPalApiError' }) instanceof PayPalApiError,
    ).toBe(false)
  })
})

describe('authAssertion', () => {
  it('builds an unsigned JWT with the given claims', () => {
    const jwt = authAssertion({ iss: 'client-id', email: 'buyer@example.com' })
    const [h, p, sig] = jwt.split('.')
    const decode = (s = '') => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')))
    expect(decode(h)).toEqual({ alg: 'none' })
    expect(decode(p)).toEqual({ iss: 'client-id', email: 'buyer@example.com' })
    expect(sig).toBe('')
  })
})
