import type Anthropic from '@anthropic-ai/sdk'
import type { PolicyRules } from '@shakedown/core'
import { z } from 'zod'
import { MODELS } from '../models'
import { POLICY_COMPILER } from '../prompts'
import { ask } from '../structured'

const CompiledPolicy = z.object({
  windowDays: z
    .number()
    .int()
    .nullable()
    .describe('Days after the order within which a refund may be given'),
  selfServeLimitCents: z
    .number()
    .int()
    .nullable()
    .describe('The most the support assistant may refund on one order without a person'),
  capAtAmountPaid: z.boolean().describe('Refunds never exceed what was paid, less earlier refunds'),
  requiresOrderEmail: z.boolean().describe("The customer must give the order's email address"),
  noRefundDuringDispute: z.boolean().describe('No refund while a dispute is open'),
  notes: z.array(z.string()).describe('Ambiguities, one short sentence each'),
})

export type CompiledPolicy = PolicyRules & { notes: string[] }

/** Read a written refund policy into rules. One small call; replayed for free after the first. */
export async function compilePolicy(
  client: Anthropic,
  policyText: string,
): Promise<CompiledPolicy> {
  const answer = await ask(client, {
    model: MODELS.planning(),
    prompt: POLICY_COMPILER,
    input: policyText.trim(),
    schema: CompiledPolicy,
    maxTokens: 512,
  })
  // Code checks what the model can't be trusted to: plausible numbers.
  const sane = (value: number | null, max: number) =>
    value === null || (Number.isInteger(value) && value > 0 && value <= max) ? value : null
  return {
    ...answer,
    windowDays: sane(answer.windowDays, 3650),
    selfServeLimitCents: sane(answer.selfServeLimitCents, 100_000_000),
  }
}

/** How a compiled policy compares with known rules, field by field. */
export function comparePolicies(actual: PolicyRules, expected: PolicyRules) {
  const fields = Object.keys(expected) as (keyof PolicyRules)[]
  const wrong = fields.filter((field) => actual[field] !== expected[field])
  return { fields: fields.length, correct: fields.length - wrong.length, wrong }
}
