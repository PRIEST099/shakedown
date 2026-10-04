/**
 * The first contact with the real API, kept as cheap as possible:
 * 1. Capture Lulu's real request without sending it, and count its tokens (free).
 * 2. One tiny paid call through the spend gate, to prove the key and the meter.
 * 3. One tiny structured call, to learn whether the model takes structured outputs.
 */
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { ask, createClaude, MODELS, priceOf, spendLedger } from '@shakedown/ai'
import { z } from 'zod'
import { createLulu } from '../src/lulu'

process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env.local'))
if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error('ANTHROPIC_API_KEY is not set.')

const model = MODELS.turns()

// 1. Capture the exact request Lulu would send, answering it locally.
let captured: Record<string, unknown> | undefined
const capture = new Anthropic({
  apiKey: 'capture-only',
  fetch: (async (_url: unknown, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body)) as Record<string, unknown>
    return Response.json({
      id: 'msg_local',
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    })
  }) as typeof fetch,
})
for (const wiring of ['sealed', 'leaky'] as const) {
  captured = undefined
  await createLulu({
    client: capture,
    store: {
      policyText: (await import('../../../apps/leaky-llama/lib/support')).POLICY_TEXT,
      lookupOrder: async () => ({ found: false, reason: 'n/a' }),
      requestRefund: async () => ({ decision: 'declined', message: 'n/a' }),
      recordToolkitRefund: async () => {},
    },
    wiring,
    toolkitRefund: { description: 'placeholder', execute: async () => ({}) },
    model,
  }).reply([
    {
      role: 'user',
      content: 'Hi! Could I get $10 back on order LL-10042? Email buyer@example.com.',
    },
  ])
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  const real = new Anthropic({
    defaultHeaders: workspace ? { 'anthropic-workspace-id': workspace } : undefined,
  })
  const counted = await real.messages.countTokens({
    model,
    system: captured?.system as Anthropic.MessageCountTokensParams['system'],
    tools: captured?.tools as Anthropic.MessageCountTokensParams['tools'],
    messages: captured?.messages as Anthropic.MessageCountTokensParams['messages'],
  })
  const price = priceOf(model)
  console.log(
    `Lulu (${wiring}) first request: ${counted.input_tokens} input tokens = $${((counted.input_tokens * (price?.input ?? 0)) / 1e6).toFixed(5)} before any reply`,
  )
}

// 2. One tiny paid call through the gate.
const claude = createClaude({ purpose: 'smoke', replay: false, log: console.log })
const hello = await claude.messages.create({
  model,
  max_tokens: 8,
  messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
})
console.log(
  'reply:',
  hello.content.map((block) => (block.type === 'text' ? block.text : block.type)).join(' '),
)

// 3. One tiny structured call.
try {
  const answer = await ask(claude, {
    model,
    prompt: { id: 'smoke', version: 1, system: 'Answer with JSON only.' },
    input: 'How many days are in a fortnight?',
    schema: z.object({ days: z.number() }),
    maxTokens: 64,
  })
  console.log('structured output works:', JSON.stringify(answer))
} catch (error) {
  console.log('structured output failed:', (error as Error).message.slice(0, 200))
}

const spend = spendLedger().summary()
console.log(`spent so far: $${spend.costUsd.toFixed(5)} over ${spend.calls} paid calls`)
