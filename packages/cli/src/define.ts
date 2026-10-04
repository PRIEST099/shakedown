/**
 * The shape of `shakedown.config.ts`. This file imports nothing, so a config can use
 * `defineConfig` without installing the CLI: when it loads a config, the CLI answers
 * `@shakedown-dev/cli` with its own copy of this module.
 */

/** The customers from hell this version can send. */
export type PersonaName = 'double-clicker' | 'cart-shuffler' | 'echo' | 'bouncer' | 'policy-lawyer'

/** A demo store's switch: the way most integrations ship, or the documented fix. */
export type Seal = 'leaky' | 'sealed'

/** Your refund policy as rules, for the Policy Lawyer. */
export interface RefundPolicy {
  /** Days after the order within which a refund may be given. `null`: no limit. */
  windowDays: number | null
  /** The most your support assistant may refund on one order without a person. `null`: no limit. */
  selfServeLimitCents: number | null
  /** Refunds never exceed what was paid, less what was already refunded. */
  capAtAmountPaid: boolean
  /** The customer must give the order's email address. */
  requiresOrderEmail: boolean
  /** No refund while a dispute is open on the order. */
  noRefundDuringDispute: boolean
}

export interface ShakedownConfig {
  /** Your store. It must be local, or an allow-listed host that serves your verification token. */
  target: {
    url: string
    /** Hosts beyond localhost and private ranges that you own and have verified. */
    allowHosts?: string[]
  }
  /** Who to send. Default: the four customers that need no AI, so a run costs nothing. */
  cast?: PersonaName[]
  /** The same seed replays the same customers, orders and amounts. */
  seed?: number
  /** Demo stores only: run every switch leaky or sealed, or choose per customer. */
  switches?: Seal | Partial<Record<PersonaName, Seal>>
  /** Your refund policy. Without it, the Policy Lawyer asks Claude to read your store's policy. */
  policy?: RefundPolicy
  budget?: {
    /** Claude spend this run may add, in US dollars. Default 0: replayed answers only. */
    aiUsd?: number
    /** Stop the campaign after this many minutes. Default 10. */
    minutes?: number
    /** Stop after this many requests to your store and PayPal, combined. */
    requests?: number
  }
  /** Explain each leak in plain words with Claude. Uses the AI budget. */
  explain?: boolean
  /** Exit with code 2 when anything was inconclusive or skipped. */
  strict?: boolean
  /** Where reports go. Default `.shakedown`. */
  outDir?: string
}

/** Type-checks a config. It returns its argument unchanged. */
export function defineConfig(config: ShakedownConfig): ShakedownConfig {
  return config
}
