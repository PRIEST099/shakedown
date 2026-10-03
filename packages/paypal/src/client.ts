import { PayPalApiError } from './errors'
import { sandboxApiUrl } from './sandbox-lock'

export interface PayPalCredentials {
  clientId: string
  clientSecret: string
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  /** JSON body, or a FormData body for the multipart dispute endpoints. */
  body?: unknown
  /**
   * A JSON string sent byte for byte. verify-webhook-signature needs the event exactly as it was
   * received, so it must not be parsed and re-serialized.
   */
  rawJson?: string
  /**
   * Idempotency key. Every POST/PATCH gets a fresh UUID unless you pass one, because each logical
   * operation needs its own key (create and capture are different operations).
   */
  requestId?: string
  /** PayPal negative testing, e.g. 'INSTRUMENT_DECLINED'. Honored by the sandbox only. */
  mock?: string
  /** PayPal-Auth-Assertion JWT, for sandbox calls made on a buyer's behalf. */
  authAssertion?: string
  query?: Record<string, string | number | boolean | undefined>
}

export interface PayPalResponse<T> {
  status: number
  data: T
  debugId?: string
  requestId?: string
}

interface CachedToken {
  value: string
  expiresAt: number
}

/** A small typed client for the PayPal sandbox REST API. Every URL goes through the sandbox lock. */
export class PayPalSandboxClient {
  readonly #credentials: PayPalCredentials
  readonly #fetch: typeof fetch
  #token?: CachedToken

  constructor(credentials: PayPalCredentials, options: { fetch?: typeof fetch } = {}) {
    this.#credentials = credentials
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  /** OAuth2 client-credentials token, cached until a minute before it expires. */
  async accessToken(): Promise<string> {
    if (this.#token && Date.now() < this.#token.expiresAt) return this.#token.value
    const basic = btoa(`${this.#credentials.clientId}:${this.#credentials.clientSecret}`)
    const res = await this.#fetch(sandboxApiUrl('/v1/oauth2/token'), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) throw await PayPalApiError.fromResponse(res)
    const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string }
    this.#token = {
      value: json.access_token,
      expiresAt: Date.now() + Math.max(0, json.expires_in - 60) * 1000,
    }
    this.#scopes = json.scope?.split(' ').filter(Boolean) ?? []
    return json.access_token
  }

  #scopes: readonly string[] = []

  /** The OAuth scopes PayPal granted this app (known after the first token). */
  grantedScopes(): readonly string[] {
    return this.#scopes
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<PayPalResponse<T>> {
    const url = sandboxApiUrl(path)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      Accept: 'application/json',
    }
    let requestId: string | undefined
    if (method === 'POST' || method === 'PATCH') {
      requestId = options.requestId ?? crypto.randomUUID()
      headers['PayPal-Request-Id'] = requestId
    }
    if (options.mock) {
      headers['PayPal-Mock-Response'] = JSON.stringify({ mock_application_codes: options.mock })
    }
    if (options.authAssertion) headers['PayPal-Auth-Assertion'] = options.authAssertion

    let body: BodyInit | undefined
    if (options.rawJson !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = options.rawJson
    } else if (options.body instanceof FormData) {
      body = options.body
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }

    const res = await this.#fetch(url, { method, headers, body })
    if (!res.ok) throw await PayPalApiError.fromResponse(res)
    const text = await res.text()
    return {
      status: res.status,
      data: (text ? JSON.parse(text) : undefined) as T,
      debugId: res.headers.get('paypal-debug-id') ?? undefined,
      requestId,
    }
  }
}

/** An unsigned (alg "none") PayPal-Auth-Assertion JWT, as the sandbox simulators expect. */
export function authAssertion(claims: { iss: string; payer_id?: string; email?: string }): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'none' })}.${encode(claims)}.`
}
