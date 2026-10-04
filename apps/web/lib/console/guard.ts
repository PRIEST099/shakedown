/**
 * Every console route that does work checks two things. The request carries the console's own
 * header, which a cross-site page cannot add without a CORS preflight that this app never
 * answers. And one address cannot call it too often.
 */
export const CONSOLE_HEADER = 'x-shakedown-console'

export function fromConsole(request: Request): boolean {
  return request.headers.get(CONSOLE_HEADER) === '1'
}

const holder = globalThis as unknown as { __shakedownLimits?: Map<string, number[]> }
if (!holder.__shakedownLimits) holder.__shakedownLimits = new Map()
const hits = holder.__shakedownLimits

/** A sliding window per address and route: true while under `max` calls in `windowMs`. */
export function underLimit(
  request: Request,
  route: string,
  max: number,
  windowMs: number,
): boolean {
  const address =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  const key = `${route}:${address}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((at: number) => now - at < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
