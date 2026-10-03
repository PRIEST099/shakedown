import { CampaignTokenError } from '@shakedown/core/campaign-token'
import { PayPalApiError } from '@shakedown/paypal'
import { CartError } from './catalog'

export const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init)

/** Turn a failure into a response that names the problem and leaks nothing else. */
export function errorResponse(error: unknown): Response {
  if (error instanceof CartError) return json({ error: error.message }, { status: 400 })
  if (error instanceof CampaignTokenError) return json({ error: error.message }, { status: 401 })
  if (error instanceof PayPalApiError) {
    return json(
      {
        error: `PayPal: ${error.issue ?? error.errorName ?? error.message}`,
        debugId: error.debugId,
      },
      { status: 502 },
    )
  }
  console.error(error)
  return json({ error: 'Something went wrong on our side.' }, { status: 500 })
}

export const MAX_BODY_BYTES = 64 * 1024

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new CartError('Request too large.')
  try {
    return JSON.parse(text || '{}') as T
  } catch {
    throw new CartError('Send JSON.')
  }
}
