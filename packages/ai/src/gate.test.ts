import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createClaude, spendLedger } from './client'
import { costOf } from './prices'
import { ask } from './structured'

/** A stand-in for the Messages API that counts how often it is really reached. */
function transport(reply: (body: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  const calls: Record<string, unknown>[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.endsWith('/count_tokens')) return Response.json({ input_tokens: 42 })
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    calls.push(body)
    return Response.json(
      {
        id: `msg_${calls.length}`,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text: 'Hello from the fake API.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 200 },
        ...reply(body),
      },
      { headers: { 'request-id': `req_${calls.length}` } },
    )
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const fresh = () => mkdtempSync(path.join(os.tmpdir(), 'shakedown-ai-'))

const say = (client: Anthropic, text = 'hi', model = 'claude-haiku-4-5') =>
  client.messages.create({ model, max_tokens: 256, messages: [{ role: 'user', content: text }] })

describe('the spend gate', () => {
  it('prices a response from its reported usage', () => {
    // Haiku 4.5: 1,000 input tokens at $1/M plus 200 output tokens at $5/M.
    expect(costOf('claude-haiku-4-5', { input_tokens: 1000, output_tokens: 200 })).toBeCloseTo(
      0.002,
      10,
    )
    expect(
      costOf('claude-haiku-4-5', {
        input_tokens: 0,
        cache_read_input_tokens: 10_000,
        output_tokens: 0,
      }),
    ).toBeCloseTo(0.001, 10)
  })

  it('pays once, records it, and replays the identical request for nothing', async () => {
    const dir = fresh()
    const api = transport()
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir,
      budgetUsd: 1,
      fetch: api.fetch,
    })
    const first = await say(client)
    const second = await say(client)
    expect(api.calls).toHaveLength(1)
    expect(second.content).toEqual(first.content)
    const records = spendLedger(dir).records()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      purpose: 'test',
      model: 'claude-haiku-4-5',
      inputTokens: 1000,
      outputTokens: 200,
    })
    expect(records[0]?.costUsd).toBeCloseTo(0.002, 10)
  })

  it('treats the same request with its keys in another order as the same request', async () => {
    const dir = fresh()
    const api = transport()
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir,
      budgetUsd: 1,
      fetch: api.fetch,
    })
    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: 'x' }],
    })
    await client.messages.create({
      messages: [{ content: 'x', role: 'user' }],
      max_tokens: 256,
      model: 'claude-haiku-4-5',
    })
    expect(api.calls).toHaveLength(1)
  })

  it('refuses a call that could overrun the budget, before it reaches the network', async () => {
    const dir = fresh()
    const api = transport()
    spendLedger(dir).record({
      at: 'earlier',
      model: 'claude-haiku-4-5',
      purpose: 'earlier work',
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0.9999,
    })
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir,
      budgetUsd: 1,
      fetch: api.fetch,
    })
    await expect(say(client)).rejects.toMatchObject({ status: 402 })
    expect(api.calls).toHaveLength(0)
    expect(spendLedger(dir).total()).toBeCloseTo(0.9999, 10)
  })

  it('still replays from the cache once the budget is spent', async () => {
    const dir = fresh()
    const api = transport()
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir,
      budgetUsd: 1,
      fetch: api.fetch,
    })
    await say(client)
    const broke = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir,
      budgetUsd: 0.000001,
      fetch: api.fetch,
    })
    await expect(say(broke)).resolves.toBeDefined()
    expect(api.calls).toHaveLength(1)
  })

  it('refuses a model it cannot price, and streaming it cannot meter', async () => {
    const api = transport()
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir: fresh(),
      budgetUsd: 1,
      fetch: api.fetch,
    })
    await expect(say(client, 'hi', 'claude-imaginary-9')).rejects.toMatchObject({ status: 400 })
    await expect(
      client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 10,
        stream: true,
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(api.calls).toHaveLength(0)
  })

  it('lets free token counting straight through', async () => {
    const api = transport()
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir: fresh(),
      budgetUsd: 0.000001,
      fetch: api.fetch,
    })
    const counted = await client.messages.countTokens({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(counted.input_tokens).toBe(42)
  })

  it('neither caches nor bills a failed call', async () => {
    const dir = fresh()
    let calls = 0
    const failing = (async () => {
      calls += 1
      return Response.json(
        { type: 'error', error: { type: 'invalid_request_error', message: 'no' } },
        { status: 400 },
      )
    }) as typeof globalThis.fetch
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir,
      budgetUsd: 1,
      fetch: failing,
    })
    await expect(say(client)).rejects.toMatchObject({ status: 400 })
    await expect(say(client)).rejects.toMatchObject({ status: 400 })
    expect(calls).toBe(2)
    expect(spendLedger(dir).records()).toHaveLength(0)
  })
})

describe('ask', () => {
  it('returns an answer that matches the schema', async () => {
    const api = transport(() => ({ content: [{ type: 'text', text: '{"days":30}' }] }))
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir: fresh(),
      budgetUsd: 1,
      fetch: api.fetch,
    })
    const answer = await ask(client, {
      model: 'claude-haiku-4-5',
      prompt: { id: 'test', version: 3, system: 'Answer in JSON.' },
      input: 'How many days?',
      schema: z.object({ days: z.number() }),
    })
    expect(answer).toEqual({ days: 30 })
    expect(String(api.calls[0]?.system)).toContain('prompt test v3')
    expect(api.calls[0]?.output_config).toBeDefined()
  })

  it('refuses an answer that does not match', async () => {
    const api = transport(() => ({ content: [{ type: 'text', text: '{"days":"thirty"}' }] }))
    const client = createClaude({
      apiKey: 'test-key-not-real',
      purpose: 'test',
      dir: fresh(),
      budgetUsd: 1,
      fetch: api.fetch,
    })
    await expect(
      ask(client, {
        model: 'claude-haiku-4-5',
        prompt: { id: 'test', version: 1, system: 'x' },
        input: 'x',
        schema: z.object({ days: z.number() }),
      }),
    ).rejects.toThrow()
  })
})
