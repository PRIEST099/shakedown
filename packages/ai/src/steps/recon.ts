import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { MODELS } from '../models'
import { TOOL_REVIEWER } from '../prompts'
import { ask } from '../structured'

const ToolReview = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      movesMoney: z.boolean(),
      limitedByPolicy: z.enum(['yes', 'no', 'unclear']),
      why: z.string(),
    }),
  ),
})

export type ToolReview = z.infer<typeof ToolReview>

export interface ToolDescription {
  name: string
  description: string
}

/**
 * Which of the assistant's tools can move money, and whether their descriptions show any limit.
 * A hint for the test plan, never a verdict: the Policy Lawyer's run decides.
 */
export async function reviewTools(
  client: Anthropic,
  input: { policyText: string; tools: readonly ToolDescription[] },
): Promise<ToolReview> {
  const listing = input.tools.map((tool) => `- ${tool.name}: ${tool.description.trim()}`).join('\n')
  const answer = await ask(client, {
    model: MODELS.planning(),
    prompt: TOOL_REVIEWER,
    input: `Refund policy:\n${input.policyText.trim()}\n\nTools:\n${listing}`,
    schema: ToolReview,
    maxTokens: 768,
  })
  // Keep only tools that exist, in the order given.
  const known = new Map(answer.tools.map((tool) => [tool.name, tool]))
  return { tools: input.tools.flatMap((tool) => known.get(tool.name) ?? []) }
}
