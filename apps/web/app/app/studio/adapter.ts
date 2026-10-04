'use client'

import type { AgAiEvent, AgLlmAdapter, AgLlmResponse } from 'ag-studio'

/**
 * The console's model connection. Each agent turn goes to Shakedown's own server, which calls
 * Claude through the spend gate (a hard cap, a replay cache and the spend log), so no API key is
 * ever in the page. The server answers a whole turn at once; the adapter replays it as AG-UI
 * events so the chat panel renders it the same way.
 */
export function consoleAdapter(endpoint = '/api/console/llm'): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      const complete: Promise<AgLlmResponse> = fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shakedown-console': '1' },
        body: JSON.stringify(request),
        signal: options?.signal,
      })
        .then(async (res) =>
          res.ok
            ? ((await res.json()) as AgLlmResponse)
            : failed(`http_${res.status}`, (await res.text()) || res.statusText),
        )
        .catch((error: Error) =>
          failed(options?.signal?.aborted ? 'cancelled' : 'network', error.message),
        )
      return {
        stream: {
          async *[Symbol.asyncIterator]() {
            yield* eventsFor(await complete)
          },
        },
        complete,
      }
    },
  }
}

function failed(code: string, message: string): AgLlmResponse {
  return {
    id: `failed_${Date.now()}`,
    createdAt: Date.now(),
    status: 'failed',
    error: { code, message },
    output: [],
  }
}

/** A finished turn as the content events a streamed one would have produced. */
export function* eventsFor(response: AgLlmResponse): Generator<AgAiEvent> {
  for (const item of response.output) {
    if (item.type === 'message') {
      const text = item.content
        .map((part) => (part.type === 'text' ? part.text : part.refusal))
        .join('')
      yield { type: 'TEXT_MESSAGE_START', messageId: item.id, role: 'assistant' }
      if (text) yield { type: 'TEXT_MESSAGE_CONTENT', messageId: item.id, delta: text }
      yield { type: 'TEXT_MESSAGE_END', messageId: item.id }
    } else if (item.type === 'function_call') {
      yield { type: 'TOOL_CALL_START', toolCallId: item.callId, toolCallName: item.name }
      yield { type: 'TOOL_CALL_ARGS', toolCallId: item.callId, delta: item.arguments }
      yield { type: 'TOOL_CALL_END', toolCallId: item.callId }
    }
  }
}
