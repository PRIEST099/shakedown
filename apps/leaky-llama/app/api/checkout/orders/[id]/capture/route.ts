import type { CartLine } from '@/lib/catalog'
import { captureCheckout } from '@/lib/checkout'
import { getDb } from '@/lib/db/client'
import { errorResponse, json, readJson } from '@/lib/http'
import { getPayPal } from '@/lib/paypal'
import { captureLimiter } from '@/lib/rate-limit'

const STATUS = { paid: 200, held: 202, declined: 402, not_found: 404 } as const

/** Capture an approved order, then ship if the payment really went through. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!captureLimiter().allow(id)) {
      return json(
        { error: 'Too many capture attempts for this order. Wait a minute.' },
        { status: 429 },
      )
    }
    const body = await readJson<{ lines?: CartLine[] }>(request)
    const outcome = await captureCheckout(
      { db: await getDb(), paypal: getPayPal() },
      { paypalOrderId: id, clientLines: Array.isArray(body.lines) ? body.lines : undefined },
    )
    return json(outcome, { status: STATUS[outcome.kind] })
  } catch (error) {
    return errorResponse(error)
  }
}
