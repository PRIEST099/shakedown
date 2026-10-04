import type Anthropic from '@anthropic-ai/sdk'
import type { Finding } from '@shakedown/core'
import { z } from 'zod'
import { MODELS } from '../models'
import { EXPLAINER } from '../prompts'
import { ask } from '../structured'

const Explanation = z.object({
  headline: z.string().describe('At most ten words'),
  explanation: z.string().describe('Two or three plain sentences'),
  firstStep: z.string().describe('The first concrete step of the fix, in one sentence'),
})

export type Explanation = z.infer<typeof Explanation>

/**
 * IDs that differ on every run (PayPal's, the store's, events') are masked before asking, so the
 * same kind of finding gets the same request, and so the same replayed answer, run after run.
 */
export function maskIds(text: string): string {
  return text
    .replace(/\bLL-\d+\b/g, 'LL-…')
    .replace(/\bWH-[0-9A-F]{6,}\b/g, 'WH-…')
    .replace(/\b(?:REFUND-|CAP-|PP-ORDER-)[\w-]+\b/g, '…')
    .replace(/\b[0-9A-Z]{17}\b/g, '…')
}

export async function explainFinding(client: Anthropic, finding: Finding): Promise<Explanation> {
  const lines = [
    `Property tested: ${finding.title}`,
    `What happened: ${maskIds(finding.detail)}`,
    `Merchant loss: $${(finding.merchantLeakCents / 100).toFixed(2)}`,
    `Customer harm: $${(finding.customerHarmCents / 100).toFixed(2)}`,
    `Standard fix: ${finding.fix}`,
  ]
  return ask(client, {
    model: MODELS.planning(),
    prompt: EXPLAINER,
    input: lines.join('\n'),
    schema: Explanation,
    maxTokens: 400,
  })
}
