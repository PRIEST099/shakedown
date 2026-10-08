import type { Budget } from './budget'
import type { Ledger } from './ledger'
import type { PayPalSide } from './paypal-side'
import type {
  CheckoutLine,
  CheckoutPort,
  DeliveryOptions,
  DeliveryResult,
  FixturesPort,
  OpenedOrder,
  OrderState,
  SupportPort,
  TargetAdapter,
  WebhookEvent,
} from './target'

/**
 * Wraps a target so that every exchange is charged to the campaign budget and written to the
 * ledger by the engine. Personas only ever hold a metered adapter, which is what keeps them
 * from being able to influence their own grade.
 */
export function meter(
  target: TargetAdapter,
  deps: { budget: Budget; ledger: Ledger },
): TargetAdapter {
  const { budget, ledger } = deps
  return {
    name: target.name,
    origin: target.origin,

    async openOrder(input): Promise<OpenedOrder> {
      budget.spend('requests')
      const order = await target.openOrder(input)
      ledger.orderOpened(order)
      return order
    },

    async deliverWebhook(event: WebhookEvent, options?: DeliveryOptions): Promise<DeliveryResult> {
      budget.spend('requests')
      const asked = options?.signed ?? true
      try {
        const result = await target.deliverWebhook(event, options)
        // Record what was really sent, not what was asked for.
        ledger.delivered(event, {
          signed: result.signed ?? asked,
          status: result.status,
          accepted: result.accepted,
        })
        return result
      } catch (error) {
        // A listener that refuses the connection is still a fact about the run.
        ledger.delivered(event, { signed: asked, status: 0, accepted: false })
        throw error
      }
    },

    async probeOrder(orderId: string): Promise<OrderState> {
      budget.spend('requests')
      const state = await target.probeOrder(orderId)
      ledger.probed(state)
      return state
    },

    checkout: target.checkout ? meterCheckout(target.checkout, deps) : undefined,
    support: target.support ? meterSupport(target.support, deps) : undefined,
    fixtures: target.fixtures ? meterFixtures(target.fixtures, deps) : undefined,
  }
}

function meterSupport(support: SupportPort, deps: { budget: Budget; ledger: Ledger }): SupportPort {
  const { budget, ledger } = deps
  return {
    async chat(turns) {
      budget.spend('requests')
      const customer = turns.at(-1)?.content ?? ''
      try {
        const answer = await support.chat(turns)
        ledger.chatted({
          customer,
          status: answer.status,
          reply: answer.reply ?? '',
          toolCalls: answer.toolCalls?.map((call) => call.name),
          error: answer.error,
        })
        return answer
      } catch (error) {
        ledger.chatted({ customer, status: 0, reply: '', error: (error as Error).message })
        throw error
      }
    },
  }
}

function meterFixtures(
  fixtures: FixturesPort,
  deps: { budget: Budget; ledger: Ledger },
): FixturesPort {
  const { budget, ledger } = deps
  return {
    async ageOrder(ref, days) {
      budget.spend('requests')
      const ok = await fixtures.ageOrder(ref, days)
      ledger.fixtureUsed({ action: 'age-order', ref, days, ok })
      return ok
    },
  }
}

function meterCheckout(
  checkout: CheckoutPort,
  deps: { budget: Budget; ledger: Ledger },
): CheckoutPort {
  const { budget, ledger } = deps
  // The cart at the catalog's prices, so a grader can tell a price the customer made up without
  // asking the store. Unknown when a line isn't in the catalog.
  const listCentsOf = (lines: readonly CheckoutLine[]) => {
    let total = 0
    for (const line of lines) {
      const item = checkout.catalog.find((candidate) => candidate.sku === line.sku)
      if (!item) return undefined
      total += item.priceCents * line.qty
    }
    return total
  }
  return {
    catalog: checkout.catalog,

    async openCheckout(input) {
      budget.spend('requests')
      const listCents = listCentsOf(input.lines)
      try {
        const opened = await checkout.openCheckout(input)
        ledger.checkoutOpened({ ...input, lines: [...input.lines], listCents, ...opened })
        return opened
      } catch (error) {
        ledger.checkoutOpened({
          ...input,
          lines: [...input.lines],
          listCents,
          status: 0,
          error: (error as Error).message,
        })
        throw error
      }
    },

    async capture(paypalOrderId, input) {
      budget.spend('requests')
      const lines = input?.lines ? [...input.lines] : undefined
      try {
        const answer = await checkout.capture(paypalOrderId, input)
        const { kind, ...rest } = answer
        ledger.captureAnswered({ ...rest, paypalOrderId, lines, answer: kind })
        return answer
      } catch (error) {
        ledger.captureAnswered({
          paypalOrderId,
          lines,
          status: 0,
          answer: 'error',
          error: (error as Error).message,
        })
        throw error
      }
    },
  }
}

/** The same discipline for PayPal's side: charged, and written down by the engine. */
export function meterPayPal(
  side: PayPalSide,
  deps: { budget: Budget; ledger: Ledger },
): PayPalSide {
  const { budget, ledger } = deps
  return {
    async confirmCard(paypalOrderId, options) {
      budget.spend('requests')
      const decline = options?.decline ?? false
      try {
        const result = await side.confirmCard(paypalOrderId, options)
        ledger.cardConfirmed({ paypalOrderId, decline, ...result })
        return result
      } catch (error) {
        ledger.cardConfirmed({ paypalOrderId, decline, status: 0, error: (error as Error).message })
        throw error
      }
    },

    async readOrder(paypalOrderId) {
      budget.spend('requests')
      const order = await side.readOrder(paypalOrderId)
      ledger.paypalRead(order)
      return order
    },

    readRefund: side.readRefund
      ? async (refundId) => {
          budget.spend('requests')
          const refund = await (side.readRefund as NonNullable<PayPalSide['readRefund']>)(refundId)
          ledger.paypalRefundRead(refund)
          return refund
        }
      : undefined,
  }
}
