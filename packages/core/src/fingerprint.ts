import type { CampaignResult } from './runner'

/**
 * What must be identical when a campaign is re-run with the same seed: every scenario's
 * verdicts and every finding's amounts. IDs that PayPal or the store mint (order and capture IDs,
 * order numbers) and timestamps differ between runs by nature, so they are left out.
 */
export function fingerprint(result: CampaignResult) {
  return {
    seed: result.seed,
    campaignId: result.campaignId,
    outcomes: result.outcomes.map((outcome) => ({
      scenario: outcome.scenario,
      skipped: outcome.skipped ?? null,
      error: outcome.error ?? null,
      verdicts: outcome.results.map(
        ({ invariant, result: graded }) => `${invariant.id}: ${graded.verdict}`,
      ),
      findings: outcome.findings.map((finding) => ({
        invariant: finding.invariant,
        severity: finding.severity,
        merchantLeakCents: finding.merchantLeakCents,
        customerHarmCents: finding.customerHarmCents,
      })),
    })),
    merchantLeakCents: result.merchantLeakCents,
    customerHarmCents: result.customerHarmCents,
  }
}
