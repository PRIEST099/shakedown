import type { Budget } from './budget'
import type { PersonaId } from './cast'
import type { Invariant } from './grader'
import type { Ledger } from './ledger'
import type { PayPalSide } from './paypal-side'
import type { PolicyRules } from './policy'
import type { Rng } from './rng'
import type { TargetAdapter } from './target'

/**
 * A scenario is one customer doing one awkward thing: plan, act, assert.
 *
 * `plan` is fixed before anything is sent, so the report can say what was attempted even if
 * the run is cancelled. `act` drives the target through the metered adapter, which records
 * every exchange. `invariants` grade the recording afterwards. A scenario never decides
 * whether it passed.
 */

export interface ScenarioContext {
  campaignId: string
  persona: PersonaId
  scenario: string
  /** Metered: every call is charged to the budget and written to the ledger. */
  target: TargetAdapter
  /** PayPal's side of the checkout, metered the same way. Present when the campaign has one. */
  paypal?: PayPalSide
  /** The target's refund policy as rules, when the campaign has them. */
  policy?: PolicyRules
  ledger: Ledger
  budget: Budget
  rng: Rng
  /**
   * Unique to this run. Anything a real store remembers across campaigns (a checkout key, say)
   * must include it, or a re-run with the same seed would collide with the last one.
   */
  runNonce: string
  signal: AbortSignal
  now(): Date
  /** Record a line of commentary for the report. Notes are never graded. */
  step(detail: string): void
}

/** What a scenario needs beyond a webhook listener and a probe. */
export type Requirement = 'checkout' | 'paypal' | 'support' | 'fixtures' | 'policy'

export interface Scenario {
  id: string
  persona: PersonaId
  title: string
  /** Skipped, not failed, when the target or campaign can't provide these. */
  requires?: readonly Requirement[]
  /** The steps, decided up front. */
  plan: readonly string[]
  act(context: ScenarioContext): Promise<void>
  invariants: readonly Invariant[]
}

export interface PersonaModule {
  id: PersonaId
  scenarios: readonly Scenario[]
}
