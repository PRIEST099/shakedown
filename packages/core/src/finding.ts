import type { PersonaId } from './cast'
import type { Cents } from './money'

export type Severity = 'high' | 'medium' | 'low'

/**
 * One fact from the run, quoted verbatim. Evidence is copied out of the ledger, never
 * composed by the AI layer, so a reader can check every claim against the raw entries.
 */
export interface Evidence {
  label: string
  value: string
}

export interface Finding {
  id: string
  campaignId: string
  persona: PersonaId
  scenario: string
  invariant: string
  /** The broken property, in the merchant's words. */
  title: string
  severity: Severity
  /** What the merchant is out if this ships as-is. */
  merchantLeakCents: Cents
  /** What the customer is out. */
  customerHarmCents: Cents
  /** What happened, stated plainly. Deterministic; the AI layer only rewrites it later. */
  detail: string
  /** The standard fix for this property. */
  fix: string
  evidence: readonly Evidence[]
  at: string
}

export function totalMerchantLeak(findings: readonly Finding[]): Cents {
  return findings.reduce((sum, finding) => sum + finding.merchantLeakCents, 0)
}

export function totalCustomerHarm(findings: readonly Finding[]): Cents {
  return findings.reduce((sum, finding) => sum + finding.customerHarmCents, 0)
}
