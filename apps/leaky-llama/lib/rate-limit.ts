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
