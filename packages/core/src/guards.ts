/**
 * Shakedown only ever points at an integration the operator owns. These guards decide
 * whether a target URL is allowed, before any request is sent.
 */

export class TargetNotAllowedError extends Error {
  readonly code = 'TARGET_NOT_ALLOWED'

  constructor(message: string) {
    super(message)
    this.name = 'TargetNotAllowedError'
  }
}

/** The file a non-local target must serve to prove the operator controls it. */
export const VERIFICATION_PATH = '/.well-known/shakedown.txt'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

/** Private and loopback ranges, which need no ownership token. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (LOCAL_HOSTNAMES.has(host)) return true
  if (host.endsWith('.localhost') || host.endsWith('.test') || host.endsWith('.local')) return true
  if (/^127\./.test(host)) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true
  return false
}

export interface TargetPolicy {
  /** Extra hostnames the operator has explicitly allowed. */
  allowHosts?: readonly string[]
  /** The token this target must serve at the verification path, if it is not local. */
  verificationToken?: string
}

export interface AllowedTarget {
  url: URL
  /** 'local' needs no proof; 'verified' must serve the token before the campaign runs. */
  trust: 'local' | 'verified'
}

/** Throw unless `input` is a target this operator is allowed to point Shakedown at. */
export function assertTargetAllowed(input: string | URL, policy: TargetPolicy = {}): AllowedTarget {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new TargetNotAllowedError('Refused an invalid target URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetNotAllowedError(`Refused ${url.protocol}: targets must be http or https.`)
  }
  if (url.username || url.password) {
    throw new TargetNotAllowedError('Refused a target URL with embedded credentials.')
  }
  if (isPrivateHost(url.hostname)) return { url, trust: 'local' }

  const allowed = policy.allowHosts?.some(
    (host) => host.toLowerCase() === url.hostname.toLowerCase(),
  )
  if (!allowed) {
    throw new TargetNotAllowedError(
      `Refused ${url.hostname}: add it to allowHosts and serve your token at ${VERIFICATION_PATH} to confirm you own it.`,
    )
  }
  if (!policy.verificationToken) {
    throw new TargetNotAllowedError(
      `${url.hostname} is allow-listed but no verification token is configured. Shakedown only runs against integrations you own.`,
    )
  }
  return { url, trust: 'verified' }
}

/** Confirm a non-local target serves the expected token. Call before the first scenario. */
export async function verifyTargetOwnership(
  target: AllowedTarget,
  policy: TargetPolicy,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
  if (target.trust === 'local') return
  const expected = policy.verificationToken
  if (!expected) throw new TargetNotAllowedError('No verification token configured.')
  const url = new URL(VERIFICATION_PATH, target.url.origin)
  let served: string
  try {
    const res = await fetchImpl(url, { method: 'GET' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    served = (await res.text()).trim()
  } catch (error) {
    throw new TargetNotAllowedError(
      `Could not read ${url.href}: ${(error as Error).message}. Serve your token there to confirm you own this target.`,
    )
  }
  if (served !== expected.trim()) {
    throw new TargetNotAllowedError(`The token at ${url.href} does not match the configured one.`)
  }
}
