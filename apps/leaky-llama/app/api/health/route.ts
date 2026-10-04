import { getDb } from '@/lib/db/client'
import { json } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** Up when the store can reach its own database. Render's health check and Shakedown's use it. */
export async function GET() {
  try {
    await getDb()
    return json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
