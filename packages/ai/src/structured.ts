import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'

export class AiAnswerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiAnswerError'
  }
}

/**
 * One structured question, answered as JSON that matches `schema` or not at all. Prompts carry
 * a version, and the version is part of the request, so changing a prompt can never replay an
 * answer written for the old one.
 */
export async function ask<S extends z.ZodType>(
  client: Anthropic,
  args: {
    model: string
    prompt: { id: string; version: number; system: string }
    input: string
    schema: S
    maxTokens?: number
  },
): Promise<z.infer<S>> {
  const response = await client.messages.parse({
    model: args.model,
    max_tokens: args.maxTokens ?? 2048,
    system: `${args.prompt.system}\n\n(prompt ${args.prompt.id} v${args.prompt.version})`,
    messages: [{ role: 'user', content: args.input }],
    output_config: { format: zodOutputFormat(args.schema) },
  })
  if (response.stop_reason === 'refusal') throw new AiAnswerError('The model declined to answer.')
  if (response.stop_reason === 'max_tokens') throw new AiAnswerError('The answer ran out of room.')
  if (response.parsed_output == null)
    throw new AiAnswerError('The answer did not match the schema.')
  return response.parsed_output as z.infer<S>
}
