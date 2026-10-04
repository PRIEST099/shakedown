import type { PersonaId } from './cast'
import type { Finding } from './finding'
import { totalCustomerHarm, totalMerchantLeak } from './finding'
import { grade } from './grader'
import type { LedgerEntry } from './ledger'
import { LedgerView } from './ledger'
import type { PersonaModule } from './persona'
import type { PolicyRules } from './policy'
import { PERSONA_MODULES } from './registry'
import { createRng } from './rng'
import type { CampaignResult, ScenarioOutcome } from './runner'

/**
 * A campaign as plain data: what happened, not how it was judged. Graders are code and change;
 * a saved ledger can be judged again by the current graders without repeating a single call,
 * which matters when every live call costs money.
 */
export interface SavedRun {
  version: 1
  campaignId: string
  seed: number
  target: string
  startedAt: string
  finishedAt: string
  policy?: PolicyRules
  outcomes: {
    scenario: string
    persona: PersonaId
    error?: string
    skipped?: string
    entries: LedgerEntry[]
  }[]
}

export function saveRun(result: CampaignResult, policy?: PolicyRules): SavedRun {
  return {
    version: 1,
    campaignId: result.campaignId,
    seed: result.seed,
    target: result.target,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    policy,
    outcomes: result.outcomes.map((outcome) => ({
      scenario: outcome.scenario,
      persona: outcome.persona,
      error: outcome.error,
      skipped: outcome.skipped,
      entries: [...outcome.entries],
    })),
  }
}

/** Judge a saved run again with today's graders. Free: nothing is sent anywhere. */
export function regrade(
  saved: SavedRun,
  modules: Partial<Record<PersonaId, PersonaModule>> = PERSONA_MODULES,
): CampaignResult {
  const findingRng = createRng((saved.seed ^ 0x9e3779b9) >>> 0)
  const outcomes: ScenarioOutcome[] = saved.outcomes.map((stored) => {
    const scenario = modules[stored.persona]?.scenarios.find((s) => s.id === stored.scenario)
    if (!scenario) {
      return {
        ...stored,
        title: stored.scenario,
        plan: [],
        results: [],
        findings: [],
        skipped: 'No longer defined.',
      }
    }
    if (stored.skipped) {
      return { ...stored, title: scenario.title, plan: scenario.plan, results: [], findings: [] }
    }
    const { results, findings } = grade(scenario.invariants, new LedgerView(stored.entries), {
      campaignId: saved.campaignId,
      scenario: scenario.id,
      at: saved.finishedAt,
      nextId: () => findingRng.id('F'),
      facts: { policy: saved.policy },
    })
    return { ...stored, title: scenario.title, plan: scenario.plan, results, findings }
  })
  const findings: Finding[] = outcomes.flatMap((outcome) => outcome.findings)
  return {
    campaignId: saved.campaignId,
    seed: saved.seed,
    target: saved.target,
    startedAt: saved.startedAt,
    finishedAt: saved.finishedAt,
    outcomes,
    findings,
    merchantLeakCents: totalMerchantLeak(findings),
    customerHarmCents: totalCustomerHarm(findings),
  }
}
