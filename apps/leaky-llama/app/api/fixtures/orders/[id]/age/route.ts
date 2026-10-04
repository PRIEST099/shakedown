import { getDb } from '@/lib/db/client'
import { ageOrder } from '@/lib/fixtures'
import { json, readJson } from '@/lib/http'
import { probeAuthorized } from '@/lib/probe'

/** Demo-store scaffolding: make an order older, so a refund-window rule can be tested. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!probeAuthorized(request)) return json({ error: 'Probe secret required.' }, { status: 403 })
  const { id } = await context.params
  const { days } = await readJson<{ days?: number }>(request)
  const aged = await ageOrder(await getDb(), decodeURIComponent(id), Number(days))
  return aged
    ? json({ aged: true, days })
    : json({ error: 'No such order, or a bad number of days.' }, { status: 400 })
}
