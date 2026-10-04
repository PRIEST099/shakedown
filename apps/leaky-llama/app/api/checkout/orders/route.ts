import { randomUUID } from 'node:crypto'
import type { CartLine } from '@/lib/catalog'
import { createCheckout } from '@/lib/checkout'
import { getDb } from '@/lib/db/client'
import { errorResponse, json, readJson } from '@/lib/http'
import { readCookie, resolveMode, VISITOR_COOKIE } from '@/lib/mode'
import { getPayPal } from '@/lib/paypal'
import { checkoutAllowed } from '@/lib/rate-limit'

/** Open a PayPal order for the cart. The v6 SDK calls this from createOrder. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ lines?: CartLine[]; email?: string; checkoutKey?: string }>(
      request,
    )
    const { mode, campaignId } = await resolveMode(request)
    if (!checkoutAllowed(request, campaignId)) {
      return json({ error: 'Too many checkouts. Try again in a few minutes.' }, { status: 429 })
    }
    const existingVisitor = readCookie(request.headers.get('cookie'), VISITOR_COOKIE)
    const visitorId = existingVisitor ?? randomUUID()

    const created = await createCheckout(
      { db: await getDb(), paypal: getPayPal() },
      {
        lines: Array.isArray(body.lines) ? body.lines : [],
        email: String(body.email ?? ''),
        checkoutKey:
          typeof body.checkoutKey === 'string' ? body.checkoutKey.slice(0, 64) : undefined,
        mode,
        campaignId,
        visitorId,
      },
    )
    const response = json({ orderId: created.paypalOrderId, ...created }, { status: 201 })
    if (!existingVisitor) {
      response.headers.append(
        'set-cookie',
        `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
      )
    }
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
