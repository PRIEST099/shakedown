import type Anthropic from '@anthropic-ai/sdk'
import type { AgAiConversationItem, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from 'ag-studio'

/**
 * One AG Studio agent turn, as a Claude Messages API call, and back. AG Studio speaks an
 * OpenAI-Responses-shaped conversation (messages, function calls, function call outputs); Claude
 * speaks content blocks (text, tool_use, tool_result). Nothing else lives here: no state, no
 * provider call, so both directions are tested without spending anything.
 */

export const CONSOLE_MODELS = ['claude-haiku-4-5'] as const
export type ConsoleModel = (typeof CONSOLE_MODELS)[number]
export const DEFAULT_CONSOLE_MODEL: ConsoleModel = 'claude-haiku-4-5'
/** A turn answers in prose or one tool call; a long dashboard config still fits. */
export const MAX_TURN_TOKENS = 2048

type Block = Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam

function parseArguments(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json || '{}') as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value }
  } catch {
    return {}
  }
}

/** The conversation as Claude messages: same-role items merged, tool results first in a turn. */
export function toClaudeMessages(input: readonly AgAiConversationItem[]): Anthropic.MessageParam[] {
  const messages: { role: 'user' | 'assistant'; content: Block[] }[] = []
  const push = (role: 'user' | 'assistant', block: Block) => {
    const last = messages.at(-1)
    if (last?.role === role) {
      // Claude wants a turn's tool results before anything else the user says.
      if (block.type === 'tool_result') {
        const firstOther = last.content.findIndex((b) => b.type !== 'tool_result')
        if (firstOther === -1) last.content.push(block)
        else last.content.splice(firstOther, 0, block)
      } else last.content.push(block)
    } else messages.push({ role, content: [block] })
  }

  for (const item of input) {
    if (item.type === 'message' && item.kind === 'input') {
      const text = item.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .filter(Boolean)
        .join('\n')
      if (!text) continue
      // A mid-conversation system note is context for the model, not a second system prompt.
      push('user', {
        type: 'text',
        text: item.role === 'system' ? `[Dashboard note] ${text}` : text,
      })
    } else if (item.type === 'message' && item.kind === 'output') {
      const text = item.content
        .map((part) => (part.type === 'text' ? part.text : `(refused: ${part.refusal})`))
        .join('\n')
      if (text) push('assistant', { type: 'text', text })
    } else if (item.type === 'function_call') {
      push('assistant', {
        type: 'tool_use',
        id: item.callId,
        name: item.name,
        input: parseArguments(item.arguments),
      })
    } else if (item.type === 'function_call_output') {
      push('user', {
        type: 'tool_result',
        tool_use_id: item.callId,
        content: item.output || '(no output)',
      })
    }
    // Reasoning items are the model's own scratch work; they are not sent back.
  }
  // A conversation must open with the user.
  if (messages[0]?.role === 'assistant') {
    messages.unshift({ role: 'user', content: [{ type: 'text', text: '(continue)' }] })
  }
  return messages
}

function toolChoice(choice: AgLlmRequest['toolChoice']): Anthropic.ToolChoice | undefined {
  if (!choice || choice === 'auto') return undefined
  if (choice === 'none') return { type: 'none' }
  if (choice === 'required') return { type: 'any' }
  return { type: 'tool', name: choice.name }
}

/** AG Studio's request as Claude Messages API parameters, on an allow-listed model only. */
export function toClaudeRequest(request: AgLlmRequest): Anthropic.MessageCreateParamsNonStreaming {
  const requested = request.model?.id
  const model = CONSOLE_MODELS.includes(requested as ConsoleModel)
    ? (requested as ConsoleModel)
    : DEFAULT_CONSOLE_MODEL
  const tools = (request.tools ?? [])
    .filter((tool) => tool.kind !== 'provided' && tool.kind !== 'server')
    .map(
      (tool): Anthropic.Tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: (tool.parameters as Anthropic.Tool.InputSchema) ?? { type: 'object' },
      }),
    )
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: MAX_TURN_TOKENS,
    // Each turn repeats the instructions, tools and conversation so far; cache that prefix.
    cache_control: { type: 'ephemeral' },
    messages: toClaudeMessages(request.input),
  } as Anthropic.MessageCreateParamsNonStreaming
  if (request.instructions) params.system = request.instructions
  if (tools.length) {
    params.tools = tools
    const choice = toolChoice(request.toolChoice)
    if (choice) params.tool_choice = choice
  }
  if (request.responseFormat?.type === 'json') {
    ;(params as unknown as { output_config: unknown }).output_config = {
      format: { type: 'json_schema', schema: request.responseFormat.schema },
    }
  }
  return params
}

/** Claude's reply as AG Studio's response: text becomes a message, tool_use a function call. */
export function fromClaudeMessage(message: Anthropic.Message): AgLlmResponse {
  const output: AgAiOutputItem[] = []
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (text || message.stop_reason === 'refusal') {
    output.push({
      id: `msg_${message.id}`,
      kind: 'output',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content:
        message.stop_reason === 'refusal'
          ? [{ type: 'refusal', refusal: text || 'The model declined to answer.' }]
          : [{ type: 'text', text, annotations: [] }],
    })
  }
  for (const block of message.content) {
    if (block.type !== 'tool_use') continue
    output.push({
      id: `fc_${block.id}`,
      kind: 'output',
      type: 'function_call',
      callId: block.id,
      name: block.name,
      arguments: JSON.stringify(block.input ?? {}),
      status: 'completed',
    })
  }
  const usage = message.usage
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const truncated = message.stop_reason === 'max_tokens'
  return {
    id: message.id,
    createdAt: Date.now(),
    status: truncated ? 'incomplete' : 'completed',
    ...(truncated ? { incompleteDetails: { reason: 'max_output_tokens' as const } } : {}),
    output,
    usage: {
      inputTokens: usage.input_tokens + cacheRead + cacheWrite,
      outputTokens: usage.output_tokens,
      cachedInputTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    },
    model: message.model,
  }
}

/** A failed turn, as AG Studio expects it: on the response, not thrown. */
export function failedTurn(code: string, message: string): AgLlmResponse {
  return {
    id: `failed_${Date.now()}`,
    createdAt: Date.now(),
    status: 'failed',
    error: { code, message },
    output: [],
  }
}
