import type { Budget } from './budget'
import type { Ledger } from './ledger'
import type {
  DeliveryOptions,
  DeliveryResult,
  OpenedOrder,
  OrderState,
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
      const signed = options?.signed ?? true
      try {
        const result = await target.deliverWebhook(event, options)
        ledger.delivered(event, {
          signed,
          status: result.status,
          accepted: result.accepted,
        })
        return result
      } catch (error) {
        // A listener that refuses the connection is still a fact about the run.
        ledger.delivered(event, { signed, status: 0, accepted: false })
        throw error
      }
    },

    async probeOrder(orderId: string): Promise<OrderState> {
      budget.spend('requests')
      const state = await target.probeOrder(orderId)
      ledger.probed(state)
      return state
    },
  }
}
