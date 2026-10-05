import { describe, expect, it, vi } from 'vitest'
import {
  captureOrder,
  createOrder,
  refundCapture,
  TRANSMISSION_HEADERS,
  transmissionHeadersOf,
  usd,
  verifySignatureBody,
  verifyWebhookSignature,
} from './api'
import type { PayPalSandboxClient } from './client'

const headers = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig==',
  'paypal-transmission-time': '2026-10-03T12:00:00Z',
}

describe('verifySignatureBody', () => {
  it('splices the event in byte for byte, odd spacing and all', () => {
    const rawEvent = '{"id":"WH-1",  "amount":{"value":"12.00"} ,"note":"caf\\u00e9"}'
    const body = verifySignatureBody({ headers, webhookId: 'WEBHOOK-1', rawEvent })
    expect(body.endsWith(`"webhook_event":${rawEvent}}`)).toBe(true)
    expect(JSON.parse(body).webhook_id).toBe('WEBHOOK-1')
    expect(JSON.parse(body).transmission_sig).toBe('sig==')
  })

  it('escapes header values rather than trusting them', () => {
    const body = verifySignatureBody({
      headers: { ...headers, 'paypal-transmission-id': 'a","webhook_id":"forged' },
      webhookId: 'WEBHOOK-1',
      rawEvent: '{}',
    })
    expect(JSON.parse(body).webhook_id).toBe('WEBHOOK-1')
  })
})

describe('verifyWebhookSignature', () => {
  const clientReturning = (status: string) =>
    ({
      request: vi.fn(async () => ({ status: 200, data: { verification_status: status } })),
    }) as unknown as PayPalSandboxClient

  it('fails closed without calling PayPal when a header is missing', async () => {
    const client = clientReturning('SUCCESS')
    const { 'paypal-transmission-sig': _dropped, ...partial } = headers
    expect(
      await verifyWebhookSignature(client, { headers: partial, webhookId: 'W', rawEvent: '{}' }),
    ).toBe('FAILURE')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('fails closed without a webhook id or with a body that is not JSON', async () => {
    const client = clientReturning('SUCCESS')
    expect(await verifyWebhookSignature(client, { headers, webhookId: '', rawEvent: '{}' })).toBe(
      'FAILURE',
    )
    expect(
      await verifyWebhookSignature(client, { headers, webhookId: 'W', rawEvent: 'not json' }),
    ).toBe('FAILURE')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('passes the raw bytes through and reports what PayPal said', async () => {
    const client = clientReturning('SUCCESS')
    const status = await verifyWebhookSignature(client, {
      headers,
      webhookId: 'W',
      rawEvent: '{"id":"WH-1"}',
    })
    expect(status).toBe('SUCCESS')
    expect(client.request).toHaveBeenCalledWith(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      { rawJson: expect.stringContaining('"webhook_event":{"id":"WH-1"}}') },
    )
  })

  it('treats any answer other than SUCCESS as a failure', async () => {
    expect(
      await verifyWebhookSignature(clientReturning('PENDING'), {
        headers,
        webhookId: 'W',
        rawEvent: '{}',
      }),
    ).toBe('FAILURE')
  })
})

describe('transmissionHeadersOf', () => {
  it('reads exactly the signed headers', () => {
    const read = transmissionHeadersOf(new Headers({ ...headers, cookie: 'nope' }))
    expect(Object.keys(read).sort()).toEqual([...TRANSMISSION_HEADERS].sort())
    expect(read['paypal-transmission-id']).toBe('tx-1')
  })
})

describe('the calls whose responses Shakedown reads', () => {
  it('ask PayPal for the whole resource, not the minimal id-and-status form', async () => {
    const request = vi.fn(async (..._args: unknown[]) => ({ status: 201, data: {} }))
    const client = { request } as unknown as PayPalSandboxClient
    await createOrder(client, { intent: 'CAPTURE' }, { requestId: 'create-1' })
    await captureOrder(client, 'ORDER-1', { requestId: 'capture-1' })
    await refundCapture(client, 'CAPTURE-1', usd(5), { requestId: 'refund-1' })
    expect(request).toHaveBeenCalledTimes(3)
    for (const call of request.mock.calls) {
      expect(call[2]).toMatchObject({ prefer: 'return=representation' })
    }
    // The caller's own options still win, the idempotency key included.
    expect(request.mock.calls[0]?.[2]).toMatchObject({ requestId: 'create-1' })
  })
})
