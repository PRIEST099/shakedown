import type { StoreMode } from './mode'
import { parseMode } from './mode'

/**
 * A campaign token tells the demo store which switches to use for one campaign's orders, so two
 * people running campaigns at once never see each other's settings. It is signed with the probe
 * secret the operator shares with their own store. Web Crypto keeps it usable in any runtime.
 */

export interface CampaignClaims {
  campaignId: string
  /** Expiry, in epoch milliseconds. */
  exp: number
  mode?: StoreMode
}

export class CampaignTokenError extends Error {
  readonly code = 'CAMPAIGN_TOKEN_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'CampaignTokenError'
  }
}

export const CAMPAIGN_HEADER = 'x-shakedown-campaign'
const VERSION = 'v1'

const encoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

export async function signCampaignToken(claims: CampaignClaims, secret: string): Promise<string> {
  if (secret.length < 16) throw new CampaignTokenError('The signing secret is too short.')
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)))
  const signed = `${VERSION}.${payload}`
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(signed))
  return `${signed}.${toBase64Url(new Uint8Array(signature))}`
}

/** Check the signature (in constant time) and the expiry, then return the claims. */
export async function verifyCampaignToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<CampaignClaims> {
  const [version, payload, signature] = token.split('.')
  if (version !== VERSION || !payload || !signature) {
    throw new CampaignTokenError('Malformed campaign token.')
  }
  let valid = false
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(`${version}.${payload}`),
    )
  } catch {
    valid = false
  }
  if (!valid) throw new CampaignTokenError('Campaign token signature does not match.')

  let claims: CampaignClaims
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as CampaignClaims
    if (typeof parsed.campaignId !== 'string' || typeof parsed.exp !== 'number') throw new Error()
    claims = parsed
  } catch {
    throw new CampaignTokenError('Campaign token payload is unreadable.')
  }
  if (claims.exp <= now) throw new CampaignTokenError('Campaign token has expired.')
  return claims.mode ? { ...claims, mode: parseMode(claims.mode) } : claims
}
