import {
  CAMPAIGN_HEADER,
  CampaignTokenError,
  verifyCampaignToken,
} from '@shakedown/core/campaign-token'
import { PERSONA_IDS } from '@shakedown/core/cast'
import { allLeaky, parseMode, type StoreMode } from '@shakedown/core/mode'

/**
 * Which switches a request runs under. A Shakedown campaign sends a signed token; a person
 * clicking around the store uses the toggle panel, which sets a cookie. Each order keeps the
 * switches it was placed under, so later notifications about it behave the same way.
 */

export const MODE_COOKIE = 'll_mode'
export const VISITOR_COOKIE = 'll_visitor'

export interface ResolvedMode {
  mode: StoreMode
  campaignId?: string
  source: 'campaign' | 'visitor' | 'default'
}

export { CampaignTokenError }

/** The cookie holds the sealed switches as a comma list; anything absent is leaky. */
export const encodeMode = (mode: StoreMode): string =>
  PERSONA_IDS.filter((id) => mode[id] === 'sealed').join(',')

export const decodeMode = (value: string | undefined): StoreMode =>
  value
    ? parseMode(Object.fromEntries(value.split(',').map((id) => [id.trim(), 'sealed'])))
    : allLeaky()

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export async function resolveMode(request: Request): Promise<ResolvedMode> {
  const token = request.headers.get(CAMPAIGN_HEADER)
  if (token) {
    const secret = process.env.SHAKEDOWN_PROBE_SECRET
    if (!secret) {
      throw new CampaignTokenError(
        'This store has no probe secret, so it cannot accept campaign tokens.',
      )
    }
    const claims = await verifyCampaignToken(token, secret)
    return { mode: claims.mode ?? allLeaky(), campaignId: claims.campaignId, source: 'campaign' }
  }
  const cookie = readCookie(request.headers.get('cookie'), MODE_COOKIE)
  if (cookie !== undefined) return { mode: decodeMode(cookie), source: 'visitor' }
  return { mode: allLeaky(), source: 'default' }
}
