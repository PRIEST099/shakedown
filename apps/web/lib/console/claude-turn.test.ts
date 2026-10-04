import type Anthropic from '@anthropic-ai/sdk'
import type { AgAiConversationItem, AgLlmRequest } from 'ag-studio'
import { describe, expect, it } from 'vitest'
import {
  failedTurn,
  fromClaudeMessage,
  MAX_TURN_TOKENS,
  toClaudeMessages,
  toClaudeRequest,
} from './claude-turn'

const user = (text: string): AgAiConversationItem => ({
  id: `u-${text}`,
  kind: 'input',
  type: 'message',
  role: 'user',
  status: 'completed',
  content: [{ type: 'text', text }],
})

const call = (callId: string, name: string, args: object): AgAiConversationItem => ({
  id: `fc-${callId}`,
  kind: 'output',
  type: 'function_call',
  callId,
  name,
  arguments: JSON.stringify(args),
})

const result = (callId: string, output: string): AgAiConversationItem => ({
  type: 'function_call_output',
  callId,
  output,
  status: 'completed',
})

describe('an AG Studio turn as a Claude request', () => {
  it('pairs every tool call with its result, in the order Claude expects', () => {
    const messages = toClaudeMessages([
      user('Which customer leaked most?'),
      call('toolu_1', 'leak_summary', { lastRuns: 5 }),
      call('toolu_2', 'view_page', {}),
      result('toolu_1', '{"top":"The Echo"}'),
      result('toolu_2', 'page 1'),
      user('Thanks'),
    ])
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[1]?.content).toEqual([
      { type: 'tool_use', id: 'toolu_1', name: 'leak_summary', input: { lastRuns: 5 } },
      { type: 'tool_use', id: 'toolu_2', name: 'view_page', input: {} },
    ])
    const third = messages[2]?.content as Anthropic.ContentBlockParam[]
    expect(third.map((b) => b.type)).toEqual(['tool_result', 'tool_result', 'text'])
  })

  it('always opens with the user, and turns mid-run system notes into context', () => {
    const messages = toClaudeMessages([
      call('toolu_9', 'view_schema', {}),
      result('toolu_9', 'schema'),
      { ...(user('The data changed.') as object), role: 'system' } as AgAiConversationItem,
    ])
    expect(messages[0]?.role).toBe('user')
    expect(JSON.stringify(messages.at(-1))).toContain('[Dashboard note] The data changed.')
  })

  it('keeps to the allowed model and a fixed reply ceiling, whatever is asked for', () => {
    const request: AgLlmRequest = {
      input: [user('hi')],
      instructions: 'You are Triage.',
      responseFormat: { type: 'text' },
      model: { id: 'claude-opus-5-5' } as AgLlmRequest['model'],
      tools: [
        {
          name: 'view_schema',
          description: 'Schema',
          parameters: { type: 'object', properties: {} },
        },
        {
          name: 'web_search',
          description: 'hosted',
          parameters: {},
          kind: 'provided',
          provider: {},
        },
      ],
      toolChoice: 'required',
    }
    const params = toClaudeRequest(request)
    expect(params.model).toBe('claude-haiku-4-5')
    expect(params.max_tokens).toBe(MAX_TURN_TOKENS)
    expect(params.system).toBe('You are Triage.')
    expect(params.tools?.map((t) => (t as Anthropic.Tool).name)).toEqual(['view_schema'])
    expect(params.tool_choice).toEqual({ type: 'any' })
    expect((params as unknown as { cache_control: unknown }).cache_control).toEqual({
      type: 'ephemeral',
    })
  })

  it('asks for JSON with a schema when the turn needs structured output', () => {
    const schema = { type: 'object', properties: { title: { type: 'string' } } }
    const params = toClaudeRequest({
      input: [user('Name this thread')],
      responseFormat: { type: 'json', name: 'title', schema },
    })
    expect((params as unknown as { output_config: unknown }).output_config).toEqual({
      format: { type: 'json_schema', schema },
    })
  })
})

describe("Claude's reply as an AG Studio response", () => {
  const message = (content: Anthropic.ContentBlock[], stop: Anthropic.StopReason = 'end_turn') =>
    ({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5',
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
      },
    }) as unknown as Anthropic.Message

  it('turns text into a message and tool_use into a function call', () => {
    const response = fromClaudeMessage(
      message(
        [
          { type: 'text', text: 'Checking.', citations: null },
          { type: 'tool_use', id: 'toolu_7', name: 'delegate_to', input: { agent: 'data' } },
        ] as unknown as Anthropic.ContentBlock[],
        'tool_use',
      ),
    )
    expect(response.status).toBe('completed')
    expect(response.output.map((item) => item.type)).toEqual(['message', 'function_call'])
    expect(response.output[1]).toMatchObject({
      callId: 'toolu_7',
      name: 'delegate_to',
      arguments: '{"agent":"data"}',
    })
    expect(response.usage).toEqual({
      inputTokens: 4100,
      outputTokens: 20,
      cachedInputTokens: 4000,
      cacheWriteTokens: 0,
    })
  })

  it('reports a reply cut off at the ceiling as incomplete', () => {
    const response = fromClaudeMessage(
      message([{ type: 'text', text: 'Partial', citations: null }] as never, 'max_tokens'),
    )
    expect(response.status).toBe('incomplete')
    expect(response.incompleteDetails).toEqual({ reason: 'max_output_tokens' })
  })

  it('reports a refused budget on the response, never as a thrown error', () => {
    expect(failedTurn('budget_exhausted', 'No headroom.')).toMatchObject({
      status: 'failed',
      error: { code: 'budget_exhausted' },
      output: [],
    })
  })
})
