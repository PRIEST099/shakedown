import { CAMPAIGN_HEADER, verifyCampaignToken } from '@shakedown/core/campaign-token'
import { transmissionHeadersOf } from '@shakedown/paypal'
import { getDb } from '@/lib/db/client'
import { errorResponse, json } from '@/lib/http'
import { getPayPal } from '@/lib/paypal'
import { deliveryAllowed } from '@/lib/rate-limit'
import { handleWebhook } from '@/lib/webhooks'

const MAX_BYTES = 256 * 1024

/**
 * PayPal's notifications land here, and so do a Shakedown campaign's test deliveries. The body
 * is read as text and handed on untouched: verification needs the exact bytes PayPal signed.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length > MAX_BYTES) return json({ error: 'Payload too large.' }, { status: 413 })

    const token = request.headers.get(CAMPAIGN_HEADER)
    const secret = process.env.SHAKEDOWN_PROBE_SECRET
    const claims = token && secret ? await verifyCampaignToken(token, secret) : undefined
    if (token && !secret)
      return json({ error: 'Campaign tokens are not accepted here.' }, { status: 401 })
    if (!deliveryAllowed(request, claims?.campaignId)) {
      return json({ error: 'Too many deliveries. Try again later.' }, { status: 429 })
    }
    const campaignMode = claims?.mode

    const result = await handleWebhook(
      { db: await getDb(), paypal: getPayPal() },
      { raw, headers: transmissionHeadersOf(request.headers), campaignMode },
    )
    return json({ outcome: result.outcome, detail: result.detail }, { status: result.status })
  } catch (error) {
    return errorResponse(error)
  }
}
