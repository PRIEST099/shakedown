import { PERSONA_IDS, type PersonaId } from '@shakedown/core/cast'
import { json, readJson } from '@/lib/http'
import { decodeMode, encodeMode, MODE_COOKIE, readCookie } from '@/lib/mode'

/** The toggle panel: flip one switch, or set them all. Stored in this visitor's cookie only. */
export async function POST(request: Request) {
  const body = await readJson<{ persona?: string; seal?: string; all?: string }>(request)
  const mode = decodeMode(readCookie(request.headers.get('cookie'), MODE_COOKIE) ?? '')
  if (body.all === 'leaky' || body.all === 'sealed') {
    for (const id of PERSONA_IDS) mode[id] = body.all
  } else if (
    PERSONA_IDS.includes(body.persona as PersonaId) &&
    (body.seal === 'leaky' || body.seal === 'sealed')
  ) {
    mode[body.persona as PersonaId] = body.seal
  } else {
    return json({ error: 'Send { persona, seal } or { all }.' }, { status: 400 })
  }
  const response = json({ mode })
  response.headers.append(
    'set-cookie',
    `${MODE_COOKIE}=${encodeURIComponent(encodeMode(mode))}; Path=/; Max-Age=31536000; SameSite=Lax`,
  )
  return response
}
