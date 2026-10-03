export interface BudgetLimits {
  /** Maximum HTTP requests to the target and to PayPal, combined. */
  requests: number
  /** Maximum wall-clock milliseconds for the whole campaign. */
  wallClockMs: number
  /** Maximum AI output tokens. Unused until the AI layer lands in Phase 5. */
  aiTokens: number
}

export const DEFAULT_BUDGET: BudgetLimits = {
  requests: 200,
  wallClockMs: 5 * 60_000,
  aiTokens: 50_000,
}

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED'

  constructor(
    readonly resource: keyof BudgetLimits,
    limit: number,
  ) {
    super(`Campaign budget exhausted: ${resource} limit of ${limit} reached.`)
    this.name = 'BudgetExceededError'
  }
}

/**
 * A hard ceiling on what one campaign may consume. Every outbound request goes through
 * `spend`, so a runaway scenario stops rather than hammering a target.
 */
export class Budget {
  readonly #limits: BudgetLimits
  readonly #now: () => number
  readonly #startedAt: number
  #requests = 0
  #aiTokens = 0

  constructor(limits: Partial<BudgetLimits> = {}, now: () => number = Date.now) {
    this.#limits = { ...DEFAULT_BUDGET, ...limits }
    this.#now = now
    this.#startedAt = now()
  }

  get limits(): BudgetLimits {
    return this.#limits
  }

  get spent() {
    return {
      requests: this.#requests,
      aiTokens: this.#aiTokens,
      wallClockMs: this.#now() - this.#startedAt,
    }
  }

  /** Charge the budget, or throw if this would exceed a limit. */
  spend(resource: 'requests' | 'aiTokens', amount = 1): void {
    this.checkClock()
    if (resource === 'requests') {
      if (this.#requests + amount > this.#limits.requests) {
        throw new BudgetExceededError('requests', this.#limits.requests)
      }
      this.#requests += amount
      return
    }
    if (this.#aiTokens + amount > this.#limits.aiTokens) {
      throw new BudgetExceededError('aiTokens', this.#limits.aiTokens)
    }
    this.#aiTokens += amount
  }

  checkClock(): void {
    if (this.#now() - this.#startedAt > this.#limits.wallClockMs) {
      throw new BudgetExceededError('wallClockMs', this.#limits.wallClockMs)
    }
  }
}
