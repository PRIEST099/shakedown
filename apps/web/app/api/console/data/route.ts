import { consoleTables } from '../../../../lib/console/rows'
import { getConsoleDb, loadCampaigns } from '../../../../lib/console/store'

export const dynamic = 'force-dynamic'

/** Every table the console charts, for the latest 50 campaigns. Read-only. */
export async function GET() {
  const db = await getConsoleDb()
  return Response.json(consoleTables(await loadCampaigns(db)), {
    headers: { 'cache-control': 'no-store' },
  })
}
