import type { BudgetLimits } from './budget'
import { Budget, BudgetExceededError } from './budget'
import type { PersonaId } from './cast'
import { EventBus } from './events'
import type { Finding } from './finding'
import { totalCustomerHarm, totalMerchantLeak } from './finding'
import type { GradedInvariant } from './grader'
import { grade } from './grader'
import type { LedgerEntry } from './ledger'
import { Ledger } from './ledger'
import { meter } from './metered'
import type { Cents } from './money'
import type { PersonaModule, Scenario, ScenarioContext } from './persona'
import { implementedPersonas, PERSONA_MODULES } from './registry'
import { createRng } from './rng'
import type { TargetAdapter } from './target'

export class CampaignCancelledError extends Error {
  readonly code = 'CAMPAIGN_CANCELLED'

  constructor() {
    super('Campaign cancelled.')
    this.name = 'CampaignCancelledError'
  }
}

export interface CampaignOptions {
  target: TargetAdapter
  /** Same seed, same run. Defaults to a timestamp, which the result always reports back. */
  seed?: number
  campaignId?: string
  cast?: readonly PersonaId[]
  budget?: Budget | Partial<BudgetLimits>
  bus?: EventBus
  signal?: AbortSignal
  now?: () => Date
  /** Override the persona registry. The CLI uses the default; tests inject their own. */
  modules?: Partial<Record<PersonaId, PersonaModule>>
}

export interface ScenarioOutcome {
  scenario: string
  title: string
  persona: PersonaId
  plan: readonly string[]
  results: GradedInvariant[]
  findings: Finding[]
  entries: readonly LedgerEntry[]
  /** Set when the scenario could not finish. Its invariants will mostly read inconclusive. */
  error?: string
}

export interface CampaignResult {
  campaignId: string
  seed: number
  target: string
  startedAt: string
  finishedAt: string
  outcomes: ScenarioOutcome[]
  findings: Finding[]
  merchantLeakCents: Cents
  customerHarmCents: Cents
  /** Set when the budget ran out or the operator stopped the run. */
  stoppedEarly?: string
}

const toBudget = (input: CampaignOptions['budget']): Budget =>
  input instanceof Budget ? input : new Budget(input ?? {})

/**
 * Runs a cast against one target. Deterministic given a seed: the same run produces the same
 * order IDs, event IDs and findings, which is what makes a report reproducible by a reviewer.
 */
export async function runCampaign(options: CampaignOptions): Promise<CampaignResult> {
  const now = options.now ?? (() => new Date())
  const seed = options.seed ?? Date.now()
  const rng = createRng(seed)
  const campaignId = options.campaignId ?? rng.id('CMP')
  const bus = options.bus ?? new EventBus()
  const budget = toBudget(options.budget)
  const signal = options.signal
  const modules = options.modules ?? PERSONA_MODULES
  const cast = (options.cast ?? implementedPersonas(modules)).filter((id) => modules[id])

  const startedAt = now().toISOString()
  const outcomes: ScenarioOutcome[] = []
  const findings: Finding[] = []
  let stoppedEarly: string | undefined

  bus.emit({ type: 'campaign:started', campaignId, seed, cast: [...cast] })

  const scenarios: Scenario[] = cast.flatMap((id) => [...(modules[id]?.scenarios ?? [])])

  try {
    for (const scenario of scenarios) {
      if (signal?.aborted) throw new CampaignCancelledError()
      budget.checkClock()

      bus.emit({ type: 'scenario:started', persona: scenario.persona, scenario: scenario.id })

      const ledger = new Ledger(now)
      const context: ScenarioContext = {
        campaignId,
        persona: scenario.persona,
        scenario: scenario.id,
        target: meter(options.target, { budget, ledger }),
        ledger,
        budget,
        rng,
        signal: signal ?? new AbortController().signal,
        now,
        step(detail) {
          ledger.noted(detail)
          bus.emit({ type: 'scenario:step', persona: scenario.persona, detail })
        },
      }

      let error: string | undefined
      try {
        await scenario.act(context)
      } catch (caught) {
        if (caught instanceof BudgetExceededError || caught instanceof CampaignCancelledError) {
          // Grade what we have, then stop the campaign.
          error = caught.message
          const partial = gradeScenario(scenario, ledger, campaignId, now, rng)
          outcomes.push({ ...partial, error })
          findings.push(...partial.findings)
          throw caught
        }
        error = caught instanceof Error ? caught.message : String(caught)
      }

      const outcome = gradeScenario(scenario, ledger, campaignId, now, rng)
      if (error) outcome.error = error
      outcomes.push(outcome)
      findings.push(...outcome.findings)

      for (const finding of outcome.findings) bus.emit({ type: 'finding', finding })
      bus.emit({
        type: 'scenario:finished',
        persona: scenario.persona,
        findings: outcome.findings.length,
      })
    }
  } catch (caught) {
    if (caught instanceof BudgetExceededError || caught instanceof CampaignCancelledError) {
      stoppedEarly = caught.message
      bus.emit({ type: 'campaign:failed', campaignId, reason: caught.message })
    } else {
      bus.emit({
        type: 'campaign:failed',
        campaignId,
        reason: caught instanceof Error ? caught.message : String(caught),
      })
      throw caught
    }
  }

  const merchantLeakCents = totalMerchantLeak(findings)
  const result: CampaignResult = {
    campaignId,
    seed,
    target: options.target.origin,
    startedAt,
    finishedAt: now().toISOString(),
    outcomes,
    findings,
    merchantLeakCents,
    customerHarmCents: totalCustomerHarm(findings),
  }
  if (stoppedEarly) result.stoppedEarly = stoppedEarly

  if (!stoppedEarly) {
    bus.emit({
      type: 'campaign:finished',
      campaignId,
      findings: findings.length,
      leakCents: merchantLeakCents,
    })
  }
  return result
}

function gradeScenario(
  scenario: Scenario,
  ledger: Ledger,
  campaignId: string,
  now: () => Date,
  rng: { id: (prefix: string) => string },
): ScenarioOutcome {
  const view = ledger.view()
  const { results, findings } = grade(scenario.invariants, view, {
    campaignId,
    scenario: scenario.id,
    at: now().toISOString(),
    nextId: () => rng.id('F'),
  })
  return {
    scenario: scenario.id,
    title: scenario.title,
    persona: scenario.persona,
    plan: scenario.plan,
    results,
    findings,
    entries: view.entries,
  }
}
