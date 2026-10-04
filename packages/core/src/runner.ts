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
import { meter, meterPayPal } from './metered'
import type { Cents } from './money'
import type { PayPalSide } from './paypal-side'
import type { PersonaModule, Requirement, Scenario, ScenarioContext } from './persona'
import type { PolicyRules } from './policy'
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

/**
 * Where a campaign's two random streams stand: the one the cast draws from, and the one finding
 * IDs come from. A run that resumes from them carries on exactly where another left off.
 */
export interface RandomStreams {
  rng: number
  findings: number
}

export interface CampaignOptions {
  target: TargetAdapter
  /** PayPal's side of a checkout: card confirmation and ledger reads. Needed by the checkout cast. */
  paypal?: PayPalSide
  /** The target's refund policy as rules. Needed by the Policy Lawyer. */
  policy?: PolicyRules
  /** Same seed, same run. Defaults to a timestamp, which the result always reports back. */
  seed?: number
  campaignId?: string
  cast?: readonly PersonaId[]
  budget?: Budget | Partial<BudgetLimits>
  bus?: EventBus
  signal?: AbortSignal
  now?: () => Date
  /** Unique per run; defaults to the start time. Tests with a fixed clock get a fixed one. */
  runNonce?: string
  /** Override the persona registry. The CLI uses the default; tests inject their own. */
  modules?: Partial<Record<PersonaId, PersonaModule>>
  /**
   * Continue another run's random streams instead of starting them from the seed. Running a
   * cast one customer at a time, each resuming from the last, draws exactly what one run of the
   * whole cast would. Needs that run's campaignId.
   */
  resume?: RandomStreams
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
  /** Set when the scenario never ran because the target can't support it. */
  skipped?: string
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
  /** Where the random streams ended, for a run that carries on from this one. */
  streams?: RandomStreams
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
  if (options.resume && !options.campaignId) {
    throw new Error('A resumed run carries on another campaign, so it needs that campaignId.')
  }
  const rng = createRng(options.resume?.rng ?? seed)
  const campaignId = options.campaignId ?? rng.id('CMP')
  // Finding IDs come from their own stream. Grading must never shift what a later scenario
  // says, or a change to one grader would change every conversation after it.
  const findingRng = createRng(options.resume?.findings ?? (seed ^ 0x9e3779b9) >>> 0)
  const bus = options.bus ?? new EventBus()
  const budget = toBudget(options.budget)
  const signal = options.signal
  const modules = options.modules ?? PERSONA_MODULES
  const cast = (options.cast ?? implementedPersonas(modules)).filter((id) => modules[id])

  const startedAt = now().toISOString()
  const runNonce = options.runNonce ?? new Date(startedAt).getTime().toString(36)
  const outcomes: ScenarioOutcome[] = []
  const findings: Finding[] = []
  let stoppedEarly: string | undefined

  bus.emit({ type: 'campaign:started', campaignId, seed, cast: [...cast] })

  const scenarios: Scenario[] = cast.flatMap((id) => [...(modules[id]?.scenarios ?? [])])

  try {
    for (const scenario of scenarios) {
      if (signal?.aborted) throw new CampaignCancelledError()
      budget.checkClock()

      const missing = unmet(scenario.requires, options)
      if (missing) {
        outcomes.push({
          scenario: scenario.id,
          title: scenario.title,
          persona: scenario.persona,
          plan: scenario.plan,
          results: [],
          findings: [],
          entries: [],
          skipped: missing,
        })
        bus.emit({
          type: 'scenario:skipped',
          persona: scenario.persona,
          scenario: scenario.id,
          reason: missing,
        })
        continue
      }

      bus.emit({ type: 'scenario:started', persona: scenario.persona, scenario: scenario.id })

      const ledger = new Ledger(now)
      const context: ScenarioContext = {
        campaignId,
        persona: scenario.persona,
        scenario: scenario.id,
        target: meter(options.target, { budget, ledger }),
        paypal: options.paypal ? meterPayPal(options.paypal, { budget, ledger }) : undefined,
        policy: options.policy,
        ledger,
        budget,
        rng,
        runNonce,
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
          const partial = gradeScenario(
            scenario,
            ledger,
            campaignId,
            now,
            findingRng,
            options.policy,
          )
          outcomes.push({ ...partial, error })
          findings.push(...partial.findings)
          throw caught
        }
        error = caught instanceof Error ? caught.message : String(caught)
      }

      const outcome = gradeScenario(scenario, ledger, campaignId, now, findingRng, options.policy)
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
    streams: { rng: rng.state(), findings: findingRng.state() },
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

const REQUIREMENT_TEXT: Record<Requirement, string> = {
  checkout: 'a checkout to walk through',
  paypal: "PayPal's side of the checkout",
  support: 'a support assistant to talk to',
  fixtures: "the demo store's test fixtures",
  policy: 'the refund policy as rules',
}

const HAS: Record<Requirement, (options: CampaignOptions) => boolean> = {
  checkout: (options) => Boolean(options.target.checkout),
  paypal: (options) => Boolean(options.paypal),
  support: (options) => Boolean(options.target.support),
  fixtures: (options) => Boolean(options.target.fixtures),
  policy: (options) => Boolean(options.policy),
}

/** Why a scenario can't run here, or undefined when it can. */
function unmet(
  requires: readonly Requirement[] | undefined,
  options: CampaignOptions,
): string | undefined {
  const missing = (requires ?? []).filter((need) => !HAS[need](options))
  return missing.length > 0
    ? `Needs ${missing.map((need) => REQUIREMENT_TEXT[need]).join(' and ')}.`
    : undefined
}

function gradeScenario(
  scenario: Scenario,
  ledger: Ledger,
  campaignId: string,
  now: () => Date,
  rng: { id: (prefix: string) => string },
  policy?: PolicyRules,
): ScenarioOutcome {
  const view = ledger.view()
  const { results, findings } = grade(scenario.invariants, view, {
    campaignId,
    scenario: scenario.id,
    at: now().toISOString(),
    nextId: () => rng.id('F'),
    facts: { policy },
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
