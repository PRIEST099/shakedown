import type { PersonaId } from '@shakedown/core/cast'

export type Verdict = 'leak' | 'sealed' | 'inconclusive'

export interface RunLine {
  personaId: PersonaId
  verdict: Verdict
  /** Negative cents = money that would have leaked. */
  amountCents: number
  evidence: string
}

export interface RunFixture {
  /** Shown next to every replay, so recorded or placeholder data is never passed off as live. */
  label: string
  source: 'placeholder' | 'recorded' | 'live'
  store: string
  runId: string
  before: readonly RunLine[]
  after: readonly RunLine[]
}

/**
 * PLACEHOLDER data for the design preview. It is replaced by a real recorded sandbox run
 * (with real PayPal sandbox IDs) once the engine exists. Never present these numbers as measured.
 */
export const PLACEHOLDER_RUN: RunFixture = {
  label: 'Placeholder run · not real sandbox data',
  source: 'placeholder',
  store: 'Leaky Llama Supply Co.',
  runId: '0042',
  before: [
    {
      personaId: 'double-clicker',
      verdict: 'leak',
      amountCents: -3600,
      evidence: '2 captures · 1 order · CAP-PLACEHOLDER',
    },
    {
      personaId: 'cart-shuffler',
      verdict: 'leak',
      amountCents: -9900,
      evidence: 'paid $1.00 · shipped $100.00',
    },
    { personaId: 'echo', verdict: 'sealed', amountCents: 0, evidence: 'unsigned event refused' },
    {
      personaId: 'policy-lawyer',
      verdict: 'leak',
      amountCents: -1800,
      evidence: 'refund outside policy · no approval',
    },
  ],
  after: [
    {
      personaId: 'double-clicker',
      verdict: 'sealed',
      amountCents: 0,
      evidence: '1 capture · 1 order',
    },
    {
      personaId: 'cart-shuffler',
      verdict: 'sealed',
      amountCents: 0,
      evidence: 'amount checked before shipping',
    },
    { personaId: 'echo', verdict: 'sealed', amountCents: 0, evidence: 'unsigned event refused' },
    {
      personaId: 'policy-lawyer',
      verdict: 'sealed',
      amountCents: 0,
      evidence: 'routed to a human',
    },
  ],
}

export const totalCents = (lines: readonly RunLine[]): number =>
  lines.reduce((sum, line) => sum + line.amountCents, 0)
