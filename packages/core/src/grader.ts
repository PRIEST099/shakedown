import type { PersonaId } from './cast'
import type { Evidence, Finding, Severity } from './finding'
import type { LedgerView } from './ledger'
import type { Cents } from './money'

/**
 * Grading is deterministic. An invariant reads the ledger and returns one of three verdicts;
 * no model is consulted and nothing probabilistic decides whether money moved.
 */

export type Verdict = 'sealed' | 'leak' | 'inconclusive'

export interface InvariantResult {
  verdict: Verdict
  /** Plain prose a merchant can check against the evidence. */
  detail: string
  merchantLeakCents?: Cents
  customerHarmCents?: Cents
  evidence?: readonly Evidence[]
  /** Overrides the invariant's severity, e.g. a real fault that happened to move no money. */
  severity?: Severity
}

export interface Invariant {
  id: string
  persona: PersonaId
  /** The property, in the merchant's words. */
  title: string
  severity: Severity
  /** The standard fix, repeated on every finding this invariant raises. */
  fix: string
  evaluate(view: LedgerView): InvariantResult
}

export interface GradedInvariant {
  invariant: Invariant
  result: InvariantResult
}

export interface GradeContext {
  campaignId: string
  scenario: string
  at: string
  /** Supplies finding IDs, seeded so a campaign reproduces exactly. */
  nextId: () => string
}

export interface GradeOutput {
  results: GradedInvariant[]
  findings: Finding[]
}

/** Run every invariant against the snapshot and turn each leak into one finding. */
export function grade(
  invariants: readonly Invariant[],
  view: LedgerView,
  context: GradeContext,
): GradeOutput {
  const results: GradedInvariant[] = []
  const findings: Finding[] = []

  for (const invariant of invariants) {
    const result = invariant.evaluate(view)
    results.push({ invariant, result })
    if (result.verdict !== 'leak') continue
    findings.push({
      id: context.nextId(),
      campaignId: context.campaignId,
      persona: invariant.persona,
      scenario: context.scenario,
      invariant: invariant.id,
      title: invariant.title,
      severity: result.severity ?? invariant.severity,
      merchantLeakCents: result.merchantLeakCents ?? 0,
      customerHarmCents: result.customerHarmCents ?? 0,
      detail: result.detail,
      fix: invariant.fix,
      evidence: result.evidence ?? [],
      at: context.at,
    })
  }

  return { results, findings }
}

/** Evidence helper: keeps labels consistent across personas. */
export const evidence = (label: string, value: string | number): Evidence => ({
  label,
  value: String(value),
})
