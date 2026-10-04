import { fromConsole, json, underLimit } from '../../../../lib/console/guard'
import { LiveCampaignError, startLiveCampaign } from '../../../../lib/console/live'

export const dynamic = 'force-dynamic'

/** Start a live campaign against Shakedown's own demo store, with its switches all one way. */
export async function POST(request: Request) {
  if (process.env.SHAKEDOWN_CONSOLE_LIVE === '0') {
    return json({ error: 'Live runs are switched off here.' }, 403)
  }
  if (!fromConsole(request)) return json({ error: 'Start runs from the console.' }, 403)
  if (!underLimit(request, 'campaigns', 6, 10 * 60_000)) {
    return json({ error: 'Too many runs. Try again in a few minutes.' }, 429)
  }
  const body = (await request.json().catch(() => ({}))) as { switches?: unknown }
  const switches = body.switches === 'sealed' ? 'sealed' : 'leaky'
  try {
    const campaign = await startLiveCampaign({ switches })
    return json({ id: campaign.id }, 202)
  } catch (error) {
    if (error instanceof LiveCampaignError) return json({ error: error.message }, error.status)
    throw error
  }
}
