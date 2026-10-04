import { payPalToolkitRefund, toolsFor } from '@shakedown/support-bot'
import { errorResponse, json } from '@/lib/http'
import { resolveMode } from '@/lib/mode'

/** The tools Lulu holds under this request's switches, as the model sees them. */
export async function GET(request: Request) {
  try {
    const { mode } = await resolveMode(request)
    const toolkit = payPalToolkitRefund({
      clientId: process.env.PAYPAL_CLIENT_ID ?? 'description-only',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? 'description-only',
    })
    return json({
      wiring: mode['policy-lawyer'],
      tools: toolsFor(mode['policy-lawyer'], toolkit.description),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
