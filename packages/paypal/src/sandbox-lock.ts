/**
 * The sandbox lock. Every PayPal request Shakedown makes goes through `sandboxApiUrl`,
 * so a live host can never be reached, whatever the configuration says.
 */
export const PAYPAL_SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com'

const SANDBOX_API_HOSTS = new Set(['api-m.sandbox.paypal.com', 'api.sandbox.paypal.com'])

export class SandboxLockError extends Error {
  readonly code = 'SANDBOX_LOCK'

  constructor(message: string) {
    super(message)
    this.name = 'SandboxLockError'
  }
}

/** Throw unless `input` is an https URL on a PayPal sandbox API host. */
export function assertSandboxApiUrl(input: string | URL): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new SandboxLockError('Refused an invalid URL.')
  }
  if (url.protocol !== 'https:') {
    throw new SandboxLockError(`Refused ${url.protocol} URL: only https to the PayPal sandbox.`)
  }
  if (url.username || url.password) {
    throw new SandboxLockError('Refused a URL with embedded credentials.')
  }
  if (url.port !== '' && url.port !== '443') {
    throw new SandboxLockError(`Refused port ${url.port}: only the default https port.`)
  }
  if (!SANDBOX_API_HOSTS.has(url.hostname)) {
    throw new SandboxLockError(
      `Refused ${url.hostname}: Shakedown only talks to the PayPal sandbox (${PAYPAL_SANDBOX_API_BASE}).`,
    )
  }
  return url
}

/** Build a sandbox API URL from a path such as `/v2/checkout/orders`, and check it. */
export function sandboxApiUrl(path: string): URL {
  return assertSandboxApiUrl(new URL(path, PAYPAL_SANDBOX_API_BASE))
}
