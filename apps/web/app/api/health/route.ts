export const dynamic = 'force-dynamic'

/** Up when the server answers. Render's health check uses it; the site works without the store. */
export function GET() {
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
}
