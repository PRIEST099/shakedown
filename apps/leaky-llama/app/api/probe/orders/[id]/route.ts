import { getDb } from '@/lib/db/client'
import { json } from '@/lib/http'
import { probeAuthorized, probeOrder } from '@/lib/probe'

/** Read-only: what the store believes about one order. Shakedown's view into the store. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!probeAuthorized(request)) return json({ error: 'Probe secret required.' }, { status: 403 })
  const { id } = await context.params
  const state = await probeOrder(await getDb(), decodeURIComponent(id))
  return json(state, { status: state.found ? 200 : 404 })
}
