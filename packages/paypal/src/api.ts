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

export function createOrder(
  client: PayPalSandboxClient,
  body: Record<string, unknown>,
  options?: RequestOptions,
) {
  return client.request<Order>('POST', '/v2/checkout/orders', { ...options, body })
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
    { ...options, body: amount ? { amount } : {} },
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
