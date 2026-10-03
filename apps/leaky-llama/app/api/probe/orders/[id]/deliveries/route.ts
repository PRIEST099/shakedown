import { getDb } from '@/lib/db/client'
import { json } from '@/lib/http'
import { probeAuthorized, probeDeliveries } from '@/lib/probe'

/** Read-only: every webhook delivery for an order, byte for byte, newest first. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!probeAuthorized(request)) return json({ error: 'Probe secret required.' }, { status: 403 })
  const { id } = await context.params
  return json({ deliveries: await probeDeliveries(await getDb(), decodeURIComponent(id)) })
}
