/**
 * A per-key cap on how often something may happen, kept in memory. It protects the operator's
 * sandbox app from a runaway client: even a browser stuck in a retry loop gets a handful of
 * attempts, not thousands. Generous enough that the Double-Clicker's retries still get through.
 */
export class RateLimiter {
  readonly #hits = new Map<string, number[]>()

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    readonly now: () => number = Date.now,
  ) {}

  /** Record an attempt. Returns false when the key has used up its window. */
  allow(key: string): boolean {
    const now = this.now()
    const recent = (this.#hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
    if (recent.length >= this.limit) {
      this.#hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.#hits.set(key, recent)
    if (this.#hits.size > 10_000) this.#hits.clear()
    return true
  }
}

const holder = globalThis as unknown as { __leakyLlamaCaptureLimit?: RateLimiter }

/** Ten capture attempts per order per minute. */
export function captureLimiter(): RateLimiter {
  holder.__leakyLlamaCaptureLimit ??= new RateLimiter(10, 60_000)
  return holder.__leakyLlamaCaptureLimit
}

const chatHolder = globalThis as unknown as { __leakyLlamaChatLimit?: RateLimiter }

/** Lulu costs real Claude tokens even though the payments are sandbox: 20 messages per 10 minutes. */
export function chatLimiter(): RateLimiter {
  chatHolder.__leakyLlamaChatLimit ??= new RateLimiter(20, 10 * 60_000)
  return chatHolder.__leakyLlamaChatLimit
}

/** Hosted for judges, the store is public: more of it is limited, and limited harder. */
export const judgeMode = () => process.env.SHAKEDOWN_JUDGE_MODE === '1'

/**
 * Who is asking. On Render, Cloudflare writes CF-Connecting-IP on every request and overwrites
 * whatever the caller sent, while X-Forwarded-For keeps anything the caller put in it.
 */
export function clientAddress(request: Request): string {
  if (process.env.RENDER) {
    const address = request.headers.get('cf-connecting-ip')?.trim()
    if (address) return address
  }
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

const named = globalThis as unknown as { __leakyLlamaLimits?: Map<string, RateLimiter> }

function limiter(name: string, limit: number, windowMs: number): RateLimiter {
  named.__leakyLlamaLimits ??= new Map()
  let found = named.__leakyLlamaLimits.get(name)
  if (!found) {
    found = new RateLimiter(limit, windowMs)
    named.__leakyLlamaLimits.set(name, found)
  }
  return found
}

const TEN_MINUTES = 10 * 60_000

/**
 * New checkouts while hosted. Each one opens a PayPal order on the operator's sandbox app, so a
 * campaign gets room for its whole cast, a shopper gets a shopper's worth, and all of them
 * together stay under a ceiling.
 */
export function checkoutAllowed(request: Request, campaignId: string | undefined): boolean {
  if (!judgeMode()) return true
  const fair = campaignId
    ? limiter('checkout:campaign', 60, TEN_MINUTES).allow(campaignId)
    : limiter('checkout:address', 20, TEN_MINUTES).allow(clientAddress(request))
  return fair && limiter('checkout:all', 300, TEN_MINUTES).allow('all')
}

/** Webhook deliveries while hosted: a campaign's test copies, or anyone else's. */
export function deliveryAllowed(request: Request, campaignId: string | undefined): boolean {
  if (!judgeMode()) return true
  return campaignId
    ? limiter('webhook:campaign', 200, TEN_MINUTES).allow(campaignId)
    : limiter('webhook:address', 30, TEN_MINUTES).allow(clientAddress(request))
}

/** Lulu while hosted: on top of each visitor's limit, one per address, since cookies are free. */
export function chatAllowedFrom(request: Request): boolean {
  return !judgeMode() || limiter('chat:address', 30, TEN_MINUTES).allow(clientAddress(request))
}
