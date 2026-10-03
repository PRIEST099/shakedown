import { loadEnv } from '@shakedown/core/env'
import {
  captureOrder,
  createOrder,
  getOrder,
  type Order,
  PayPalSandboxClient,
  type Refund,
  refundCapture,
  type TransmissionHeaders,
  type VerificationStatus,
  verifyWebhookSignature,
} from '@shakedown/paypal'

/**
 * Everything the store asks of PayPal, behind one small interface. The live implementation goes
 * through the sandbox-locked client; tests swap in a fake.
 */
export interface PayPalPort {
  createOrder(body: Record<string, unknown>, requestId?: string): Promise<Order>
  captureOrder(paypalOrderId: string, requestId?: string): Promise<Order>
  getOrder(paypalOrderId: string): Promise<Order>
  refundCapture(
    captureId: string,
    amount: { currency_code: string; value: string },
    requestId?: string,
  ): Promise<Refund>
  verifyWebhook(input: {
    headers: TransmissionHeaders
    rawEvent: string
  }): Promise<VerificationStatus>
  /** Whether a webhook ID is configured. Without one, a sealed listener can verify nothing. */
  readonly canVerify: boolean
}

export function livePayPal(): PayPalPort {
  const env = loadEnv()
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env.local.')
  }
  const client = new PayPalSandboxClient({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
  })
  const webhookId = env.PAYPAL_WEBHOOK_ID ?? ''
  return {
    canVerify: Boolean(webhookId),
    async createOrder(body, requestId) {
      return (await createOrder(client, body, { requestId })).data
    },
    async captureOrder(paypalOrderId, requestId) {
      return (await captureOrder(client, paypalOrderId, { requestId })).data
    },
    async getOrder(paypalOrderId) {
      return (await getOrder(client, paypalOrderId)).data
    },
    async refundCapture(captureId, amount, requestId) {
      return (await refundCapture(client, captureId, amount, { requestId })).data
    },
    verifyWebhook({ headers, rawEvent }) {
      return verifyWebhookSignature(client, { headers, webhookId, rawEvent })
    },
  }
}

const holder = globalThis as unknown as { __leakyLlamaPayPal?: PayPalPort }

export function getPayPal(): PayPalPort {
  holder.__leakyLlamaPayPal ??= livePayPal()
  return holder.__leakyLlamaPayPal
}
