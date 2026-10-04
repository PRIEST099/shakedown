import { liveStatus } from '../../../../lib/console/status'

export const dynamic = 'force-dynamic'

/** Whether a live run can work right now, and if not, why. Checked at most once a minute. */
export async function GET() {
  return Response.json(await liveStatus(), { headers: { 'cache-control': 'no-store' } })
}
