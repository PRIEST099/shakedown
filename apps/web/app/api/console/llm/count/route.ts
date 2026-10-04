import type Anthropic from '@anthropic-ai/sdk'
import { createClaude } from '@shakedown/ai'
import type { AgLlmRequest } from 'ag-studio'
import { toClaudeRequest } from '../../../../../lib/console/claude-turn'
import { fromConsole, json } from '../../../../../lib/console/guard'

export const dynamic = 'force-dynamic'

/**
 * Development only: how many input tokens a console turn would send, from Anthropic's free
 * token-counting endpoint. Lets the agents' prompts be measured before a single paid call.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return json({ error: 'Not here.' }, 404)
  if (!fromConsole(request)) return json({ error: 'Console only.' }, 403)
  const params = toClaudeRequest((await request.json()) as AgLlmRequest)
  const { model, messages, system, tools, tool_choice } = params
  const claude = createClaude({ purpose: 'console-count' })
  const counted = await claude.messages.countTokens({
    model,
    messages,
    system,
    tools: tools as Anthropic.MessageCountTokensTool[] | undefined,
    tool_choice,
  })
  return json({ inputTokens: counted.input_tokens, tools: tools?.length ?? 0 })
}
