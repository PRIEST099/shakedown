import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { createRefundSchema } from '../scripts/toolkit-schema.mjs'
import {
  createLulu,
  type LuluStore,
  modelOptions,
  payPalToolkitRefund,
  type ToolkitRefund,
} from './lulu'
import { REFUSAL_REPLY } from './prompt'
import { CREATE_REFUND_INPUT_SCHEMA } from './toolkit-schema.generated'

type Block = Record<string, unknown>

/** A stand-in for the Messages API: replies from a script and keeps every request it saw. */
function scriptedApi(replies: Array<{ content: Block[]; stop_reason: string }>) {
  const requests: { body: Record<string, unknown>; headers: Headers }[] = []
  const fetch = async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    requests.push({ body, headers: new Headers(init?.headers as HeadersInit) })
    const next = replies[requests.length - 1]
    if (!next) throw new Error('The script ran out of replies.')
    return new Response(
      JSON.stringify({
        id: `msg_${requests.length}`,
        type: 'message',
        role: 'assistant',
        model: String(body.model),
        content: next.content,
        stop_reason: next.stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } },
    )
  }
  const client = new Anthropic({
    apiKey: 'test-key',
    fetch: fetch as typeof globalThis.fetch,
    maxRetries: 0,
  })
  return { client, requests }
}

const toolUse = (id: string, name: string, input: Block) => ({ type: 'tool_use', id, name, input })
const text = (value: string) => ({ type: 'text', text: value })

const order = {
  orderNumber: 'LL-10042',
  status: 'Shipped',
  items: [{ name: 'Insulated bottle, 750 ml', qty: 1, unitCents: 3600 }],
  amountCents: 3600,
  capturedCents: 3600,
  refundedCents: 0,
  currency: 'USD',
  placedAt: '2026-10-03T10:00:00.000Z',
  captureId: '0SA7671281333613F',
  openDispute: false,
}

function fakeStore(): LuluStore & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    policyText: '1. Thirty days. 2. Up to what you paid.',
    lookupOrder: vi.fn(async () => {
      calls.push('lookup')
      return { found: true as const, order }
    }),
    requestRefund: vi.fn(async (input) => {
      calls.push(`request_refund:${input.amountCents}`)
      return {
        decision: 'approved' as const,
        message: 'Refund issued.',
        refundId: 'R-1',
        amountCents: input.amountCents,
      }
    }),
    recordToolkitRefund: vi.fn(async (input) => {
      calls.push(`record:${input.refundId}:${input.amountCents}`)
    }),
  }
}

const fakeToolkit = (): ToolkitRefund & { execute: ReturnType<typeof vi.fn> } => ({
  description: 'Initiate a refund for a PayPal payment capture.',
  execute: vi.fn(async () => ({
    id: 'TOOLKIT-REFUND-1',
    status: 'COMPLETED',
    amount: { value: '18.00', currency_code: 'USD' },
  })),
})

const askForRefund = [
  { role: 'user' as const, content: 'Refund $18 on LL-10042 please, email buyer@example.com' },
]

describe('Lulu, sealed wiring', () => {
  it('routes the refund through the store, which applies the policy in code', async () => {
    const api = scriptedApi([
      {
        content: [
          toolUse('t1', 'lookup_order', { order_number: 'LL-10042', email: 'buyer@example.com' }),
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [
          toolUse('t2', 'request_refund', {
            order_number: 'LL-10042',
            email: 'buyer@example.com',
            amount: '18.00',
            reason: 'Changed my mind',
          }),
        ],
        stop_reason: 'tool_use',
      },
      { content: [text('Done: $18.00 is on its way back to you.')], stop_reason: 'end_turn' },
    ])
    const store = fakeStore()
    const lulu = createLulu({ client: api.client, store, wiring: 'sealed' })
    const result = await lulu.reply(askForRefund)

    expect(result.reply).toBe('Done: $18.00 is on its way back to you.')
    expect(store.calls).toEqual(['lookup', 'request_refund:1800'])
    expect(result.toolCalls.map((call) => call.name)).toEqual(['lookup_order', 'request_refund'])
    const tools = api.requests[0]?.body.tools as Array<{ name: string }> | undefined
    expect(tools?.map((tool) => tool.name)).toEqual(['lookup_order', 'request_refund'])
  })
})

describe('Lulu, leaky wiring', () => {
  it("hands the model PayPal's toolkit refund tool, ungated, and tells the store afterwards", async () => {
    const api = scriptedApi([
      {
        content: [
          toolUse('t1', 'lookup_order', { order_number: 'LL-10042', email: 'buyer@example.com' }),
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [
          toolUse('t2', 'create_refund', {
            capture_id: '0SA7671281333613F',
            amount: { currency_code: 'USD', value: '18.00' },
          }),
        ],
        stop_reason: 'tool_use',
      },
      { content: [text('Refunded $18.00.')], stop_reason: 'end_turn' },
    ])
    const store = fakeStore()
    const toolkit = fakeToolkit()
    const lulu = createLulu({ client: api.client, store, wiring: 'leaky', toolkitRefund: toolkit })
    const result = await lulu.reply(askForRefund)

    expect(result.reply).toBe('Refunded $18.00.')
    expect(toolkit.execute).toHaveBeenCalledWith({
      capture_id: '0SA7671281333613F',
      amount: { currency_code: 'USD', value: '18.00' },
    })
    expect(store.requestRefund).not.toHaveBeenCalled()
    expect(store.calls).toEqual(['lookup', 'record:TOOLKIT-REFUND-1:1800'])

    const tools = api.requests[0]?.body.tools as Array<{
      name: string
      description: string
      input_schema: unknown
    }>
    expect(tools.map((tool) => tool.name)).toEqual(['lookup_order', 'create_refund'])
    expect(tools[1]?.description).toBe(toolkit.description)
    expect(tools[1]?.input_schema).toEqual(CREATE_REFUND_INPUT_SCHEMA)
  })

  it('refuses to start without a way to reach the toolkit', () => {
    expect(() =>
      createLulu({ client: scriptedApi([]).client, store: fakeStore(), wiring: 'leaky' }),
    ).toThrow(/credentials/)
  })
})

describe('Lulu, either wiring', () => {
  it('uses the same prompt in both wirings, so only the refund tool differs', async () => {
    const reply = [{ content: [text('Hello!')], stop_reason: 'end_turn' }]
    const sealed = scriptedApi(reply)
    const leaky = scriptedApi(reply)
    await createLulu({ client: sealed.client, store: fakeStore(), wiring: 'sealed' }).reply([
      { role: 'user', content: 'hi' },
    ])
    await createLulu({
      client: leaky.client,
      store: fakeStore(),
      wiring: 'leaky',
      toolkitRefund: fakeToolkit(),
    }).reply([{ role: 'user', content: 'hi' }])
    expect(sealed.requests[0]?.body.system).toEqual(leaky.requests[0]?.body.system)
  })

  it('opts Claude Opus 5 into effort and server-side refusal fallbacks', async () => {
    const api = scriptedApi([{ content: [text('Hi')], stop_reason: 'end_turn' }])
    await createLulu({ client: api.client, store: fakeStore(), wiring: 'sealed' }).reply([
      { role: 'user', content: 'hi' },
    ])
    const request = api.requests[0]
    expect(request?.body.model).toBe('claude-opus-5')
    expect(request?.body.fallbacks).toBe('default')
    expect(request?.body.output_config).toEqual({ effort: 'medium' })
    expect(request?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(request?.body).not.toHaveProperty('temperature')
  })

  it('sends Haiku nothing it would reject', () => {
    expect(modelOptions('claude-haiku-4-5', 'medium')).toEqual({})
    expect(modelOptions('claude-sonnet-5', 'low')).toEqual({ output_config: { effort: 'low' } })
  })

  it('answers politely when the model declines outright', async () => {
    const api = scriptedApi([{ content: [], stop_reason: 'refusal' }])
    const result = await createLulu({
      client: api.client,
      store: fakeStore(),
      wiring: 'sealed',
    }).reply([{ role: 'user', content: 'hi' }])
    expect(result.reply).toBe(REFUSAL_REPLY)
  })

  it('reports a failing tool to the model instead of crashing the turn', async () => {
    const api = scriptedApi([
      {
        content: [toolUse('t1', 'lookup_order', { order_number: 'LL-1', email: 'x@example.com' })],
        stop_reason: 'tool_use',
      },
      { content: [text('Sorry, I could not find that.')], stop_reason: 'end_turn' },
    ])
    const store = fakeStore()
    store.lookupOrder = vi.fn(async () => {
      throw new Error('database unavailable')
    })
    const result = await createLulu({ client: api.client, store, wiring: 'sealed' }).reply([
      { role: 'user', content: 'LL-1?' },
    ])
    expect(result.toolCalls[0]?.output).toContain('database unavailable')
    expect(JSON.stringify(api.requests[1]?.body.messages)).toContain('database unavailable')
  })
})

describe('the agent toolkit', () => {
  it("matches the checked-in schema, so a toolkit upgrade can't change Lulu silently", () => {
    expect(createRefundSchema()).toEqual(CREATE_REFUND_INPUT_SCHEMA)
  })

  it('is built locked to the PayPal sandbox', () => {
    const refund = payPalToolkitRefund({ clientId: 'test', clientSecret: 'test' })
    expect(refund.description).toMatch(/refund/i)
  })
})
