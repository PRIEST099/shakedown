'use client'

import type { PersonaId } from '@shakedown/core'
import { type RunLine, Tape } from '@shakedown/ui'
import type { ConsoleTables } from '../../lib/console/rows'

/**
 * The pocket receipt: the console on a phone. AG Studio needs 720 px, so a narrow screen gets the
 * latest run as a single Tape instead, with the same numbers the console shows.
 */
export function PocketReceipt({ tables }: { tables: ConsoleTables }) {
  const run = [...tables.campaigns].sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  if (!run) return <p className="sd-pocket">No runs yet.</p>

  const checks = tables.checks.filter((check) => check.campaign_id === run.campaign_id)
  const order = tables.cast.map((persona) => persona.persona_id)
  const lines: RunLine[] = order
    .map((id: PersonaId): RunLine | undefined => {
      const mine = checks.filter((check) => check.persona_id === id)
      if (mine.length === 0) return undefined
      const leaks = mine.filter((check) => check.verdict === 'Leak')
      const atRisk = leaks.reduce((sum, check) => sum + Math.round(check.at_risk_usd * 100), 0)
      return {
        personaId: id,
        verdict: leaks.length
          ? 'leak'
          : mine.some((c) => c.verdict === 'Sealed')
            ? 'sealed'
            : 'inconclusive',
        amountCents: -atRisk,
        evidence: leaks.length
          ? `${leaks.length} ${leaks.length === 1 ? 'leak' : 'leaks'}: ${leaks[0]?.check}`
          : 'Every check held',
      }
    })
    .filter((line): line is RunLine => line !== undefined)
  const total = -Math.round(run.at_risk_usd * 100)

  return (
    <section className="sd-pocket" aria-label="Latest run">
      <p className="sd-pocket__note">
        The full console needs a wider screen. Here is the latest run.
      </p>
      <Tape
        meta={`${run.source === 'recorded' ? 'Recorded sandbox run' : 'Sandbox run'} · ${run.run_label}`}
        lines={lines}
        total={{ fromCents: 0, toCents: total, progress: 1 }}
        tone={run.leaks > 0 ? 'leak' : 'sealed'}
        stamp={run.leaks > 0 ? undefined : { text: 'SEALED', progress: 1 }}
      />
    </section>
  )
}
