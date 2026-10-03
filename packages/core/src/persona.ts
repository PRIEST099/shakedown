import type { Budget } from './budget'
import type { PersonaId } from './cast'
import type { Invariant } from './grader'
import type { Ledger } from './ledger'
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
  ledger: Ledger
  budget: Budget
  rng: Rng
  signal: AbortSignal
  now(): Date
  /** Record a line of commentary for the report. Notes are never graded. */
  step(detail: string): void
}

export interface Scenario {
  id: string
  persona: PersonaId
  title: string
  /** The steps, decided up front. */
  plan: readonly string[]
  act(context: ScenarioContext): Promise<void>
  invariants: readonly Invariant[]
}

export interface PersonaModule {
  id: PersonaId
  scenarios: readonly Scenario[]
}
