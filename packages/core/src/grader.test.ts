import { describe, expect, it } from 'vitest'
import type { Invariant } from './grader'
import { evidence, grade } from './grader'
import { LedgerView } from './ledger'

const stub = (
  id: string,
  result: Partial<Invariant> & { verdict: 'sealed' | 'leak' | 'inconclusive'; leak?: number },
): Invariant => ({
  id,
  persona: 'echo',
  title: `property ${id}`,
  severity: 'high',
  fix: `fix ${id}`,
  evaluate: () => ({
    verdict: result.verdict,
    detail: `detail ${id}`,
    merchantLeakCents: result.leak,
    evidence: [evidence('Order ID', 'ORD-1')],
  }),
})

const context = {
  campaignId: 'CMP-1',
  scenario: 'echo.unsigned-event',
  at: '2026-10-03T00:00:00.000Z',
  nextId: (() => {
    let n = 0
    return () => {
      n += 1
      return `F-${n}`
    }
  })(),
}

describe('grade', () => {
  it('raises one finding per leaking invariant and none for the others', () => {
    const view = new LedgerView([])
    const { results, findings } = grade(
      [
        stub('a', { verdict: 'sealed' }),
        stub('b', { verdict: 'leak', leak: 4200 }),
        stub('c', { verdict: 'inconclusive' }),
      ],
      view,
      { ...context, nextId: () => 'F-1' },
    )
    expect(results.map((entry) => entry.result.verdict)).toEqual(['sealed', 'leak', 'inconclusive'])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      id: 'F-1',
      campaignId: 'CMP-1',
      scenario: 'echo.unsigned-event',
      invariant: 'b',
      persona: 'echo',
      severity: 'high',
      merchantLeakCents: 4200,
      customerHarmCents: 0,
      fix: 'fix b',
      detail: 'detail b',
    })
  })

  it('carries the evidence through untouched', () => {
    const { findings } = grade(
      [stub('b', { verdict: 'leak', leak: 1 })],
      new LedgerView([]),
      context,
    )
    expect(findings[0]?.evidence).toEqual([{ label: 'Order ID', value: 'ORD-1' }])
  })

  it('defaults money to zero rather than leaving it undefined', () => {
    const invariant: Invariant = {
      ...stub('d', { verdict: 'leak' }),
      evaluate: () => ({ verdict: 'leak', detail: 'no amount given' }),
    }
    const { findings } = grade([invariant], new LedgerView([]), context)
    expect(findings[0]?.merchantLeakCents).toBe(0)
    expect(findings[0]?.customerHarmCents).toBe(0)
    expect(findings[0]?.evidence).toEqual([])
  })

  it('stringifies evidence values so a report never prints [object Object]', () => {
    expect(evidence('Fulfilments', 2)).toEqual({ label: 'Fulfilments', value: '2' })
  })
})
