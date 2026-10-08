import { CAMPAIGN_HEADER } from '../campaign-token'
import type { TargetPolicy } from '../guards'
import { assertTargetAllowed, verifyTargetOwnership } from '../guards'
import type {
  CaptureAnswer,
  CatalogItem,
  CheckoutLine,
  CheckoutOpened,
  OrderState,
  TargetAdapter,
} from '../target'
import {
  catalogItemsOf,
  centsOf,
  dollarsOf,
  fillPath,
  pick,
  type RouteMap,
  type RouteSpec,
  render,
  resolveRoutes,
  type Template,
} from './routes'

/**
 * A store reached over HTTP: its checkout routes, its webhook listener and its probe API.
 * Leaky Llama speaks Shakedown's own contract; any other store is described by a route map
 * (see ./routes), which `shakedown discover` can write from the store's source code.
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
  /** Where the store's routes are and how they talk. Unset parts use Shakedown's contract. */
  routes?: RouteMap
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

const string = (value: unknown) =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
const bool = (value: unknown) => (typeof value === 'boolean' ? value : undefined)

/** The variables a cart line's template can use. */
function lineVars(line: CheckoutLine, catalog: readonly CatalogItem[]) {
  const item = catalog.find((entry) => entry.sku === line.sku)
  return {
    sku: line.sku,
    qty: line.qty,
    unitCents: line.unitCents,
    unitPrice: line.unitCents === undefined ? undefined : dollarsOf(line.unitCents),
    name: item?.name,
  }
}

export async function httpStoreTarget(options: HttpStoreOptions): Promise<TargetAdapter> {
  const allowed = assertTargetAllowed(options.baseUrl, options.policy)
  await verifyTargetOwnership(allowed, options.policy ?? {}, options.fetch)
  const base = allowed.url.origin
  const http = options.fetch ?? globalThis.fetch
  const routes = resolveRoutes(options.routes)

  const headers = (route: RouteSpec, vars: Record<string, unknown> = {}, json = true) => {
    const extra: Record<string, string> = {}
    for (const [name, value] of Object.entries(route.headers ?? {})) {
      const filled = render(value, vars)
      if (filled !== undefined && filled !== '') extra[name] = String(filled)
    }
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(options.campaignToken ? { [CAMPAIGN_HEADER]: options.campaignToken } : {}),
      ...extra,
    }
  }

  /** A request to one of the store's routes, with its body filled in from a template. */
  const send = (
    route: RouteSpec,
    opts: { param?: string; body?: Template; vars?: Record<string, unknown>; raw?: string } = {},
  ) => {
    const method = route.method ?? 'POST'
    const path = opts.param === undefined ? route.path : fillPath(route.path, opts.param)
    const payload =
      opts.raw ??
      (opts.body === undefined ? undefined : JSON.stringify(render(opts.body, opts.vars ?? {})))
    return http(`${base}${path}`, {
      method,
      headers: headers(route, opts.vars, method !== 'GET'),
      ...(method === 'GET' || payload === undefined ? {} : { body: payload }),
    })
  }

  // With the products given in the config there is no catalog request to fail on, so check the
  // store answers at all: a run against a store that isn't running must stop, not judge nothing.
  if (options.catalog || routes.catalog === false) {
    await http(`${base}${routes.createOrder.path}`, { method: 'OPTIONS' })
  }

  const catalog: CatalogItem[] =
    options.catalog ??
    (await (async () => {
      const route = routes.catalog
      if (route === false) {
        throw new Error('The store has no catalog route, and the config gives no target.catalog.')
      }
      const res = await send(route)
      if (!res.ok)
        throw new Error(
          `The store's catalog route (${route.path}) answered HTTP ${res.status}; give target.catalog instead.`,
        )
      return catalogItemsOf(await res.json(), route).items
    })())

  /** The variables a body template can use for this cart. */
  const cartVars = (
    input: { lines?: CheckoutLine[]; email?: string; checkoutKey?: string },
    line: Template | undefined,
  ) => {
    const totalCents = (input.lines ?? []).reduce((sum, entry) => {
      const price =
        entry.unitCents ?? catalog.find((item) => item.sku === entry.sku)?.priceCents ?? 0
      return sum + price * entry.qty
    }, 0)
    // A checkout of one product reads its first line's fields at the top level.
    const first = input.lines?.[0]
    return {
      ...(first ? lineVars(first, catalog) : {}),
      lines: input.lines?.map((entry) => render(line, lineVars(entry, catalog))),
      email: input.email,
      checkoutKey: input.checkoutKey,
      totalCents,
      total: dollarsOf(totalCents),
      currency: 'USD',
    }
  }

  const openCheckout = async (input: {
    lines: CheckoutLine[]
    email: string
    checkoutKey?: string
  }): Promise<CheckoutOpened> => {
    const route = routes.createOrder
    const vars = cartVars(input, route.line)
    const res = await send(route, { body: route.body, vars })
    const body = await readJson(res)
    const answer = route.answer
    const dollars = centsOf(pick(body, answer.amount), 'dollars')
    const paypalOrderId = string(pick(body, answer.paypalOrderId))
    return {
      status: res.status,
      // A store with routes of its own that keeps no order number knows its orders by PayPal's
      // order ID, and so does its probe route.
      storeOrderId:
        string(pick(body, answer.storeOrderId)) ??
        (options.routes?.createOrder && !options.routes.createOrder.answer?.storeOrderId
          ? paypalOrderId
          : undefined),
      paypalOrderId,
      amountCents: number(pick(body, answer.amountCents)) ?? dollars,
      currency: string(pick(body, answer.currency)),
      reused: pick(body, answer.reused) === true,
      error: string(pick(body, answer.error)),
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
      // A store that keeps no order number of its own is known by its PayPal order.
      const ref = opened.storeOrderId ?? opened.paypalOrderId
      if (!ref) throw new Error(`The store did not open an order: ${opened.error ?? opened.status}`)
      return {
        orderId: ref,
        captureId: `CAP-${ref}`,
        amountCents: opened.amountCents ?? item.priceCents,
        currency: opened.currency ?? 'USD',
      }
    },

    async deliverWebhook(event) {
      // Only PayPal can sign for a real store, so every delivery from here goes unsigned, and
      // says so. A listener that refuses unsigned events is doing its job.
      const res = await send(routes.webhook, { raw: JSON.stringify(event) })
      return { status: res.status, accepted: res.ok, body: await res.text(), signed: false }
    },

    async probeOrder(ref): Promise<OrderState> {
      const route = routes.probe
      const res = await http(`${base}${fillPath(route.path, ref)}`, {
        method: route.method ?? 'GET',
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
      const refunds = Array.isArray(body.refunds)
        ? (body.refunds as Record<string, unknown>[])
        : undefined
      const escalations = Array.isArray(body.escalations)
        ? (body.escalations as Record<string, unknown>[])
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
        refunds: refunds?.map((row) => ({
          paypalRefundId: text(row.paypalRefundId) ?? null,
          amountCents: number(row.amountCents) ?? 0,
          source: text(row.source) ?? 'unknown',
        })),
        escalations: escalations?.map((row) => ({
          amountCents: number(row.amountCents) ?? 0,
          reason: text(row.reason) ?? '',
        })),
      }
    },

    ...(routes.support === false
      ? {}
      : {
          support: {
            async chat(turns) {
              const route = routes.support as Exclude<typeof routes.support, false>
              const res = await send(route, { body: route.body, vars: { messages: turns } })
              const body = await readJson(res)
              const calls = pick(body, route.answer?.toolCalls ?? 'toolCalls')
              return {
                status: res.status,
                reply: text(pick(body, route.answer?.reply ?? 'reply')),
                toolCalls: (Array.isArray(calls) ? (calls as Record<string, unknown>[]) : []).map(
                  (call) => ({ name: text(call.name) ?? 'unknown', input: call.input }),
                ),
                error: text(pick(body, route.answer?.error ?? 'error')),
              }
            },
          },
        }),

    fixtures: {
      async ageOrder(ref, days) {
        const res = await http(`${base}/api/fixtures/orders/${encodeURIComponent(ref)}/age`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [PROBE_HEADER]: options.probeSecret },
          body: JSON.stringify({ days }),
        })
        return res.ok
      },
    },

    checkout: {
      catalog,
      openCheckout,
      async capture(paypalOrderId, input): Promise<CaptureAnswer> {
        const route = routes.capture
        const res = await send(route, {
          param: paypalOrderId,
          body: route.body,
          // Some stores take the order in the body ({ orderId }), not the path.
          vars: { ...cartVars({ lines: input?.lines }, route.line), paypalOrderId },
        })
        const body = await readJson(res)
        const answer = route.answer
        // A store that passes PayPal's answer through says COMPLETED where Leaky Llama says paid.
        const status = string(pick(body, answer.status))
        const kind =
          text(pick(body, answer.kind)) ??
          (status === 'COMPLETED' ? 'paid' : status?.toLowerCase()) ??
          (res.ok ? 'unknown' : 'error')
        return {
          status: res.status,
          kind,
          storeOrderId: string(pick(body, answer.storeOrderId)),
          captureId: string(pick(body, answer.captureId)),
          shipped: bool(pick(body, answer.shipped)),
          error: text(pick(body, answer.error)),
        }
      },
    },
  }
}
