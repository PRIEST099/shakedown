import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Finding } from '@shakedown/core'
import { describe, expect, it } from 'vitest'
import { createClaude } from '../client'
import { explainFinding, maskIds } from './explain'
import { comparePolicies, compilePolicy } from './policy'
import { reviewTools } from './recon'

/** A fake Messages API that answers every request with the same JSON text, and counts calls. */
function answering(json: unknown) {
  const calls: Record<string, unknown>[] = []
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    calls.push(body)
    return Response.json({
      id: `msg_${calls.length}`,
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [{ type: 'text', text: JSON.stringify(json) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 50 },
    })
  }) as typeof globalThis.fetch
  const client = createClaude({
    apiKey: 'test-key-not-real',
    purpose: 'test',
    dir: mkdtempSync(path.join(os.tmpdir(), 'shakedown-steps-')),
    budgetUsd: 1,
    fetch,
  })
  return { client, calls }
}

const RULES = {
  windowDays: 30,
  selfServeLimitCents: 10000,
  capAtAmountPaid: true,
  requiresOrderEmail: true,
  noRefundDuringDispute: true,
}

describe('compilePolicy', () => {
  it('reads the answer into rules', async () => {
    const { client, calls } = answering({ ...RULES, notes: [] })
    expect(await compilePolicy(client, '30 days.')).toEqual({ ...RULES, notes: [] })
    expect(String(calls[0]?.system)).toContain('policy-compiler v1')
    expect(calls[0]?.model).toBe('claude-haiku-4-5')
  })

  it('throws away numbers no policy would have', async () => {
    const { client } = answering({
      ...RULES,
      windowDays: -5,
      selfServeLimitCents: 0,
      notes: ['odd'],
    })
    const rules = await compilePolicy(client, 'x')
    expect(rules.windowDays).toBeNull()
    expect(rules.selfServeLimitCents).toBeNull()
  })

  it('compares compiled rules with known ones, field by field', () => {
    expect(comparePolicies({ ...RULES, windowDays: 60 }, RULES)).toEqual({
      fields: 5,
      correct: 4,
      wrong: ['windowDays'],
    })
  })
})

describe('reviewTools', () => {
  it('keeps only tools that exist, in the order given', async () => {
    const { client } = answering({
      tools: [
        {
          name: 'create_refund',
          movesMoney: true,
          limitedByPolicy: 'no',
          why: 'Refunds any amount.',
        },
        { name: 'made_up_tool', movesMoney: true, limitedByPolicy: 'no', why: 'Invented.' },
        { name: 'lookup_order', movesMoney: false, limitedByPolicy: 'unclear', why: 'Reads only.' },
      ],
    })
    const review = await reviewTools(client, {
      policyText: '30 days.',
      tools: [
        { name: 'lookup_order', description: 'Looks up an order.' },
        { name: 'create_refund', description: 'Refunds a capture.' },
      ],
    })
    expect(review.tools.map((tool) => tool.name)).toEqual(['lookup_order', 'create_refund'])
  })
})

describe('explainFinding', () => {
  const finding = (orderId: string, refundId: string): Finding => ({
    id: 'F-1',
    campaignId: 'CMP-1',
    persona: 'policy-lawyer',
    scenario: 'policy-lawyer.over-the-limit',
    invariant: 'policy-lawyer.no-refund-beyond-policy',
    title: 'No refund goes beyond what the policy allows',
    severity: 'high',
    merchantLeakCents: 12400,
    customerHarmCents: 0,
    detail: `Refunds above $100.00 go to a person. The assistant refunded $124.00 on ${orderId} anyway (${refundId}).`,
    fix: 'Enforce the policy in code.',
    evidence: [],
    at: 'now',
  })

  it("masks the run's IDs, so the same kind of finding is explained once and then replayed", async () => {
    const { client, calls } = answering({
      headline: 'Over the limit',
      explanation: 'x',
      firstStep: 'y',
    })
    await explainFinding(client, finding('LL-10042', '3MV82345AB1234567'))
    await explainFinding(client, finding('LL-10099', '9ZZ00000ZZ0000000'))
    expect(calls).toHaveLength(1)
    const sent = JSON.stringify(calls[0]?.messages)
    expect(sent).not.toContain('LL-10042')
    expect(sent).not.toContain('3MV82345AB1234567')
  })

  it('masks every kind of run-specific ID it knows', () => {
    expect(maskIds('LL-10042 WH-3DE8317FD35B REFUND-12 CAP-PP-ORDER-3 2GS64859V33226827')).toBe(
      'LL-… WH-… … … …',
    )
  })
})
