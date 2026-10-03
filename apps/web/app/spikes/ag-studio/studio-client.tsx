'use client'

import { CAST } from '@shakedown/core/cast'
import { AgStudio } from 'ag-studio-react'

// Spike S7a: does AG Studio 3 render in our Next 16 / React 19 app with our own data?
// Placeholder rows only, shaped like the findings the console will show in Phase 8.
const RUNS = ['run-0040', 'run-0041', 'run-0042']
const AT_RISK: Record<string, number[]> = {
  'double-clicker': [36, 36, 0],
  'cart-shuffler': [99, 0, 0],
  echo: [0, 12, 0],
  bouncer: [42, 0, 0],
  'policy-lawyer': [18, 18, 0],
  'second-opinion': [20, 20, 0],
}

const findings = CAST.flatMap((persona) =>
  RUNS.map((run, i) => {
    const atRisk = AT_RISK[persona.id]?.[i] ?? 0
    return {
      run,
      persona: persona.name,
      property: persona.tests,
      channel: persona.channel,
      verdict: atRisk > 0 ? 'LEAK' : 'SEALED',
      at_risk_usd: atRisk,
    }
  }),
)

export function StudioClient() {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <AgStudio data={{ sources: [{ id: 'findings', data: findings }] }} mode="edit" />
    </div>
  )
}
