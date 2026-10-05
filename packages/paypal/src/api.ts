import type { PayPalSandboxClient, RequestOptions } from './client'

/** Minimal typed wrappers for the endpoints Shakedown uses. Fields are trimmed to what we read. */

export interface Money {
  currency_code: string
  value: string
}

export interface Link {
  href: string
  rel: string
  method?: string
}

export interface Capture {
  id: string
  status: string
  amount: Money
  final_capture?: boolean
  seller_receivable_breakdown?: { gross_amount?: Money; paypal_fee?: Money; net_amount?: Money }
  links?: Link[]
}

export interface Order {
  id: string
  status: string
  intent?: string
  payment_source?: Record<string, unknown>
  purchase_units?: Array<{
    reference_id?: string
    amount?: Money
    payee?: { merchant_id?: string; email_address?: string }
    payments?: { captures?: Capture[] }
  }>
  links?: Link[]
}

export interface Refund {
  id: string
  status: string
  amount?: Money
  links?: Link[]
}

export interface CardSource {
  number: string
  expiry: string
  security_code: string
  name: string
  billing_address: {
    address_line_1: string
    admin_area_2: string
    admin_area_1: string
    postal_code: string
    country_code: string
  }
}

export const usd = (value: number | string): Money => ({
  currency_code: 'USD',
  value: typeof value === 'number' ? value.toFixed(2) : value,
})

/**
 * Ask for the whole resource back. What we read from these responses (the captures in a capture
 * call, a refund's status) is absent from PayPal's minimal form (APIMatic's PayPal SDK reference:
 * "A minimal response includes the id, status and HATEOAS links").
 */
const FULL = { prefer: 'return=representation' } as const

export function createOrder(
  client: PayPalSandboxClient,
  body: Record<string, unknown>,
  options?: RequestOptions,
) {
  return client.request<Order>('POST', '/v2/checkout/orders', { ...FULL, ...options, body })
}

export function getOrder(client: PayPalSandboxClient, orderId: string) {
  return client.request<Order>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`)
}

export function captureOrder(
  client: PayPalSandboxClient,
  orderId: string,
  options?: RequestOptions,
) {
  return client.request<Order>(
    'POST',
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      ...FULL,
      ...options,
      body: options?.body ?? {},
    },
  )
}

export function getCapture(client: PayPalSandboxClient, captureId: string) {
  return client.request<Capture>('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`)
}

export function refundCapture(
  client: PayPalSandboxClient,
  captureId: string,
  amount?: Money,
  options?: RequestOptions,
) {
  return client.request<Refund>(
    'POST',
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    { ...FULL, ...options, body: amount ? { amount } : {} },
  )
}

export function getRefund(client: PayPalSandboxClient, refundId: string) {
  return client.request<Refund>('GET', `/v2/payments/refunds/${encodeURIComponent(refundId)}`)
}

export function getDispute(client: PayPalSandboxClient, disputeId: string) {
  return client.request<Record<string, unknown>>(
    'GET',
    `/v1/customer/disputes/${encodeURIComponent(disputeId)}`,
  )
}

export function listDisputes(client: PayPalSandboxClient, query?: RequestOptions['query']) {
  return client.request<{ items?: Array<Record<string, unknown>> }>(
    'GET',
    '/v1/customer/disputes',
    {
      query,
    },
  )
}

/** Captures and the first payee of an order, wherever PayPal put them. */
export function capturesOf(order: Order): Capture[] {
  return order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []) ?? []
}

export function payerActionLink(order: Order): string | undefined {
  return order.links?.find((link) => link.rel === 'payer-action')?.href
}

/** The transmission headers PayPal signs a webhook delivery with. */
export const TRANSMISSION_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
] as const

export type TransmissionHeader = (typeof TRANSMISSION_HEADERS)[number]
export type TransmissionHeaders = Partial<Record<TransmissionHeader, string | null>>

/** Pull the transmission headers off an incoming request. */
export function transmissionHeadersOf(headers: Headers): TransmissionHeaders {
  return Object.fromEntries(TRANSMISSION_HEADERS.map((name) => [name, headers.get(name)]))
}

/**
 * The verify-webhook-signature request body, built around the event's raw bytes. The event is
 * spliced in verbatim: parsing and re-serializing it would change the bytes PayPal signed, and
 * a genuine event would then fail verification.
 */
export function verifySignatureBody(input: {
  headers: TransmissionHeaders
  webhookId: string
  rawEvent: string
}): string {
  const field = (name: TransmissionHeader) => JSON.stringify(input.headers[name] ?? '')
  return `{"auth_algo":${field('paypal-auth-algo')},"cert_url":${field('paypal-cert-url')},"transmission_id":${field('paypal-transmission-id')},"transmission_sig":${field('paypal-transmission-sig')},"transmission_time":${field('paypal-transmission-time')},"webhook_id":${JSON.stringify(input.webhookId)},"webhook_event":${input.rawEvent}}`
}

export type VerificationStatus = 'SUCCESS' | 'FAILURE'

/** Ask PayPal whether a delivery is genuine. Anything malformed fails closed, without a call. */
export async function verifyWebhookSignature(
  client: PayPalSandboxClient,
  input: { headers: TransmissionHeaders; webhookId: string; rawEvent: string },
): Promise<VerificationStatus> {
  const missing = TRANSMISSION_HEADERS.some((name) => !input.headers[name])
  if (missing || !input.webhookId) return 'FAILURE'
  try {
    JSON.parse(input.rawEvent)
  } catch {
    return 'FAILURE'
  }
  const res = await client.request<{ verification_status: string }>(
    'POST',
    '/v1/notifications/verify-webhook-signature',
    { rawJson: verifySignatureBody(input) },
  )
  return res.data.verification_status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE'
}

/** Attach a card to an order the store created. This is what card fields do in the browser. */
export function confirmPaymentSource(
  client: PayPalSandboxClient,
  orderId: string,
  card: CardSource,
  options?: RequestOptions,
) {
  return client.request<Order>(
    'POST',
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/confirm-payment-source`,
    {
      ...options,
      body: {
        payment_source: {
          card: { ...card, attributes: { verification: { method: 'SCA_WHEN_REQUIRED' } } },
        },
      },
    },
  )
}

/**
 * PayPal's published sandbox test card. It only works against the sandbox, which is the only
 * place this client can reach. Pass `CARD_DECLINE_TRIGGER` as the name to get a real decline.
 */
export function sandboxTestCard(name = 'Sandbox Customer'): CardSource {
  return {
    number: '4012888888881881',
    expiry: '2030-12',
    security_code: '123',
    name,
    billing_address: {
      address_line_1: '1 Test Street',
      admin_area_2: 'San Jose',
      admin_area_1: 'CA',
      postal_code: '95131',
      country_code: 'US',
    },
  }
}

/** The sandbox cardholder name that makes a capture come back DECLINED (see SPIKES.md, S4). */
export const CARD_DECLINE_TRIGGER = 'CCREJECT-REFUSED'
