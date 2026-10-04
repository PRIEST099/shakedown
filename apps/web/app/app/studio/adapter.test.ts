import type { AgLlmResponse } from 'ag-studio'
import { describe, expect, it } from 'vitest'
import { eventsFor } from './adapter'

describe('the console adapter', () => {
  it('replays a finished turn as the events a streamed one would produce', () => {
    const response: AgLlmResponse = {
      id: 'msg_1',
      createdAt: 0,
      status: 'completed',
      output: [
        {
          id: 'm1',
          kind: 'output',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'text', text: 'Checking.', annotations: [] }],
        },
        {
          id: 'fc1',
          kind: 'output',
          type: 'function_call',
          callId: 'toolu_1',
          name: 'leak_summary',
          arguments: '{"lastRuns":5}',
        },
      ],
    }
    expect([...eventsFor(response)].map((event) => event.type)).toEqual([
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
    ])
  })

  it('emits nothing for a failed turn: the failure travels on the response', () => {
    expect([
      ...eventsFor({
        id: 'x',
        createdAt: 0,
        status: 'failed',
        output: [],
        error: { code: 'budget_exhausted', message: '' },
      }),
    ]).toEqual([])
  })
})
