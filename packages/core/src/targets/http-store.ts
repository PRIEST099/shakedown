import { CAMPAIGN_HEADER } from '../campaign-token'
import type { TargetPolicy } from '../guards'
import { assertTargetAllowed, verifyTargetOwnership } from '../guards'
import type {
  CaptureAnswer,
  CatalogItem,
  CheckoutOpened,
  OrderState,
  TargetAdapter,
} from '../target'

/**
 * A store reached over HTTP: its checkout routes, its webhook listener and its probe API.
 * Leaky Llama speaks this contract; an operator's own store can too.
 *
 * Before anything is sent, the target must pass Shakedown's ownership guards: a local address,
 * or an allow-listed host that serves the operator's verification token.
 */
export interface HttpStoreOptions {
  baseUrl: string
  /** The secret the operator shares between Shakedown and their store's probe API. */
  probeSecret: string
  /** A demo store's signed switch settings for this campaign. */
  campaignToken?: string
  policy?: TargetPolicy
  fetch?: typeof fetch
  /** Used when the store has no catalog route. */
  catalog?: CatalogItem[]
}

export const PROBE_HEADER = 'x-shakedown-probe'

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const number = (value: unknown) => (typeof value === 'number' ? value : undefined)

export async function httpStoreTarget(options: HttpStoreOptions): Promise<TargetAdapter> {
  const allowed = assertTargetAllowed(options.baseUrl, options.policy)
  await verifyTargetOwnership(allowed, options.policy ?? {}, options.fetch)
  const base = allowed.url.origin
  const http = options.fetch ?? globalThis.fetch

  const headers = (json = true): Record<string, string> => ({
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(options.campaignToken ? { [CAMPAIGN_HEADER]: options.campaignToken } : {}),
  })

  const catalog: CatalogItem[] =
    options.catalog ??
    (await (async () => {
      const res = await http(`${base}/api/catalog`)
      if (!res.ok)
        throw new Error(`The store has no catalog route (HTTP ${res.status}); pass one in.`)
      const body = (await res.json()) as { items?: CatalogItem[] }
      return body.items ?? []
    })())

  const openCheckout = async (input: {
    lines: { sku: string; qty: number; unitCents?: number }[]
    email: string
    checkoutKey?: string
  }): Promise<CheckoutOpened> => {
    const res = await http(`${base}/api/checkout/orders`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(input),
    })
    const body = await readJson(res)
    return {
      status: res.status,
      storeOrderId: text(body.orderNumber),
      paypalOrderId: text(body.paypalOrderId) ?? text(body.orderId),
      amountCents: number(body.amountCents),
      currency: text(body.currency),
      reused: body.reused === true,
      error: text(body.error),
    }
  }

  return {
    name: 'http-store',
    origin: base,

    async openOrder() {
      const item = [...catalog].sort((a, b) => a.priceCents - b.priceCents)[0]
      if (!item) throw new Error('The store has nothing for sale.')
      const opened = await openCheckout({
        lines: [{ sku: item.sku, qty: 1 }],
        email: 'echo-customer@example.com',
      })
      if (!opened.storeOrderId)
        throw new Error(`The store did not open an order: ${opened.error ?? opened.status}`)
      return {
        orderId: opened.storeOrderId,
        captureId: `CAP-${opened.storeOrderId}`,
        amountCents: opened.amountCents ?? item.priceCents,
        currency: opened.currency ?? 'USD',
      }
    },

    async deliverWebhook(event) {
      // Only PayPal can sign for a real store, so every delivery from here goes unsigned, and
      // says so. A listener that refuses unsigned events is doing its job.
      const res = await http(`${base}/api/paypal/webhook`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(event),
      })
      return { status: res.status, accepted: res.ok, body: await res.text(), signed: false }
    },

    async probeOrder(ref): Promise<OrderState> {
      const res = await http(`${base}/api/probe/orders/${encodeURIComponent(ref)}`, {
        headers: { [PROBE_HEADER]: options.probeSecret },
      })
      if (res.status === 403) throw new Error('The store refused the probe secret.')
      const body = await readJson(res)
      const shipments = Array.isArray(body.shipments)
        ? (body.shipments as Record<string, unknown>[])
        : undefined
      const deliveries = Array.isArray(body.webhooks)
        ? (body.webhooks as Record<string, unknown>[])
        : undefined
      return {
        orderId: text(body.orderId) ?? ref,
        found: body.found === true,
        status: text(body.status) ?? 'unknown',
        fulfillmentCount: number(body.fulfillmentCount) ?? 0,
        amountCents: number(body.amountCents) ?? 0,
        currency: text(body.currency) ?? 'USD',
        paypalOrderId: text(body.paypalOrderId) ?? null,
        captureId: text(body.captureId) ?? null,
        capturedCents: number(body.capturedCents),
        shipments: shipments?.map((row) => ({
          source: text(row.source) ?? 'unknown',
          valueCents: number(row.valueCents) ?? 0,
        })),
        deliveries: deliveries?.map((row) => ({
          eventId: text(row.eventId) ?? null,
          outcome: text(row.outcome) ?? 'unknown',
        })),
      }
    },

    checkout: {
      catalog,
      openCheckout,
      async capture(paypalOrderId, input): Promise<CaptureAnswer> {
        const res = await http(
          `${base}/api/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
          {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ lines: input?.lines }),
          },
        )
        const body = await readJson(res)
        return {
          status: res.status,
          kind: text(body.kind) ?? (res.ok ? 'unknown' : 'error'),
          storeOrderId: text(body.orderNumber),
          captureId: text(body.captureId),
          shipped: typeof body.shipped === 'boolean' ? body.shipped : undefined,
          error: text(body.error) ?? text(body.reason),
        }
      },
    },
  }
}
