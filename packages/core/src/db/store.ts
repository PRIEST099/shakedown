import type { CampaignResult } from '../runner'
import type { Database } from './client'
import { campaigns, findings, invariantResults, ledgerEntries, scenarioRuns } from './schema'

/**
 * Writes a finished campaign in one transaction. The ledger keeps its order, and every
 * finding points at the scenario run whose entries it was graded from.
 */
export async function saveCampaign(db: Database, result: CampaignResult): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id: result.campaignId,
      seed: result.seed,
      target: result.target,
      startedAt: new Date(result.startedAt),
      finishedAt: new Date(result.finishedAt),
      stoppedEarly: result.stoppedEarly ?? null,
      merchantLeakCents: result.merchantLeakCents,
      customerHarmCents: result.customerHarmCents,
    })

    for (const [position, outcome] of result.outcomes.entries()) {
      const [run] = await tx
        .insert(scenarioRuns)
        .values({
          campaignId: result.campaignId,
          persona: outcome.persona,
          scenario: outcome.scenario,
          title: outcome.title,
          plan: [...outcome.plan],
          error: outcome.error ?? null,
          position,
        })
        .returning({ id: scenarioRuns.id })
      if (!run) throw new Error('Could not record the scenario run.')

      if (outcome.entries.length > 0) {
        await tx.insert(ledgerEntries).values(
          outcome.entries.map((entry, index) => ({
            scenarioRunId: run.id,
            position: index,
            kind: entry.kind,
            at: new Date(entry.at),
            entry,
          })),
        )
      }

      if (outcome.results.length > 0) {
        await tx.insert(invariantResults).values(
          outcome.results.map(({ invariant, result: graded }) => ({
            scenarioRunId: run.id,
            invariant: invariant.id,
            title: invariant.title,
            verdict: graded.verdict,
            detail: graded.detail,
          })),
        )
      }

      if (outcome.findings.length > 0) {
        await tx.insert(findings).values(
          outcome.findings.map((finding) => ({
            id: finding.id,
            campaignId: result.campaignId,
            scenarioRunId: run.id,
            persona: finding.persona,
            scenario: finding.scenario,
            invariant: finding.invariant,
            title: finding.title,
            severity: finding.severity,
            merchantLeakCents: finding.merchantLeakCents,
            customerHarmCents: finding.customerHarmCents,
            detail: finding.detail,
            fix: finding.fix,
            evidence: [...finding.evidence],
            at: new Date(finding.at),
          })),
        )
      }
    }
  })
}
