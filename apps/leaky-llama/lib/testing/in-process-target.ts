import type {
  CaptureAnswer,
  CheckoutOpened,
  OrderState,
  PayPalOrderView,
  PayPalSide,
  TargetAdapter,
} from '@shakedown/core'
import type { StoreMode } from '@shakedown/core/mode'
import { toCents } from '@shakedown/core/money'
import { capturesOf, PayPalApiError } from '@shakedown/paypal'
import { CATALOG, CartError } from '../catalog'
import { captureCheckout, createCheckout, type StoreDeps } from '../checkout'
import { probeOrder } from '../probe'
import { handleWebhook } from '../webhooks'
import type { FakePayPal } from './fake-paypal'
import { signedHeaders, unsignedHeaders } from './fake-paypal'

/**
 * Leaky Llama as a Shakedown target, called in-process instead of over HTTP, with the fake
 * PayPal standing in for the sandbox. It answers exactly as the HTTP routes do, so the cast can
 * be tested in seconds; the HTTP adapter covers the real thing.
 */
export function inProcessStore(
  deps: StoreDeps & { paypal: FakePayPal },
  mode: StoreMode,
): { target: TargetAdapter; paypal: PayPalSide } {
  const campaignId = 'CMP-IN-PROCESS'

  const openCheckout = async (input: {
    lines: { sku: string; qty: number; unitCents?: number }[]
    email: string
    checkoutKey?: string
  }): Promise<CheckoutOpened> => {
    try {
      const created = await createCheckout(deps, { ...input, mode, campaignId })
      return {
        status: 201,
        storeOrderId: created.orderNumber,
        paypalOrderId: created.paypalOrderId,
        amountCents: created.amountCents,
        currency: created.currency,
        reused: created.reused,
      }
    } catch (error) {
      if (error instanceof CartError) return { status: 400, error: error.message }
      if (error instanceof PayPalApiError)
        return { status: 502, error: error.issue ?? error.message }
      throw error
    }
  }

  const STATUS = { paid: 200, held: 202, declined: 402, not_found: 404 } as const

  const target: TargetAdapter = {
    name: 'leaky-llama (in-process)',
    origin: 'in-process://leaky-llama',

    async openOrder() {
      const opened = await openCheckout({
        lines: [{ sku: 'LL-BTL-750', qty: 1 }],
        email: 'echo-customer@example.com',
      })
      if (!opened.storeOrderId) throw new Error(`Could not open an order: ${opened.error}`)
      return {
        orderId: opened.storeOrderId,
        captureId: `CAP-${opened.storeOrderId}`,
        amountCents: opened.amountCents ?? 0,
        currency: opened.currency ?? 'USD',
      }
    },

    async deliverWebhook(event, options) {
      const signed = options?.signed ?? true
      const result = await handleWebhook(deps, {
        raw: JSON.stringify(event),
        headers: signed ? signedHeaders : unsignedHeaders,
        campaignMode: mode,
      })
      return { status: result.status, accepted: result.status < 300, body: result.detail, signed }
    },

    async probeOrder(ref): Promise<OrderState> {
      const state = await probeOrder(deps.db, ref)
      return {
        orderId: state.orderId,
        found: state.found,
        status: state.status,
        fulfillmentCount: state.fulfillmentCount,
        amountCents: state.amountCents,
        currency: state.currency,
        paypalOrderId: 'paypalOrderId' in state ? state.paypalOrderId : undefined,
        captureId: 'captureId' in state ? state.captureId : undefined,
        capturedCents: 'capturedCents' in state ? state.capturedCents : undefined,
        shipments:
          'shipments' in state
            ? state.shipments?.map((row) => ({ source: row.source, valueCents: row.valueCents }))
            : undefined,
        deliveries:
          'webhooks' in state
            ? state.webhooks?.map((row) => ({ eventId: row.eventId, outcome: row.outcome }))
            : undefined,
      }
    },

    checkout: {
      catalog: CATALOG.map(({ sku, name, priceCents }) => ({ sku, name, priceCents })),
      openCheckout,
      async capture(paypalOrderId, input): Promise<CaptureAnswer> {
        const outcome = await captureCheckout(deps, { paypalOrderId, clientLines: input?.lines })
        return {
          status: STATUS[outcome.kind],
          kind: outcome.kind,
          storeOrderId: 'orderNumber' in outcome ? outcome.orderNumber : undefined,
          captureId: 'captureId' in outcome ? outcome.captureId : undefined,
          shipped: 'shipped' in outcome ? outcome.shipped : undefined,
        }
      },
    },
  }

  const paypal: PayPalSide = {
    async confirmCard(paypalOrderId, options) {
      const order = deps.paypal.orders.get(paypalOrderId)
      if (!order) return { status: 404, error: 'INVALID_RESOURCE_ID' }
      // The sandbox's decline trigger leaves the order COMPLETED around a DECLINED capture.
      order.behaviour = options?.decline ? 'decline-inside-completed-order' : 'complete'
      return { status: 200, orderStatus: 'APPROVED' }
    },
    async readOrder(paypalOrderId): Promise<PayPalOrderView> {
      const order = deps.paypal.orders.get(paypalOrderId)
      if (!order) return { paypalOrderId, found: false, status: 'NOT_FOUND', captures: [] }
      const held = order.captured
      return {
        paypalOrderId,
        found: true,
        status: held?.status ?? 'APPROVED',
        captures: held
          ? capturesOf(held).map((capture) => ({
              id: capture.id,
              status: capture.status,
              amountCents: toCents(capture.amount.value),
              currency: capture.amount.currency_code,
            }))
          : [],
      }
    },
  }

  return { target, paypal }
}
