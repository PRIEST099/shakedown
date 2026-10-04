import { readFileSync } from 'node:fs'
import path from 'node:path'
import { regrade, type SavedRun } from '@shakedown/core'
import { describe, expect, it } from 'vitest'
import { exhibit, goldenRun } from './golden-run'

const RECORDED = path.resolve(import.meta.dirname, '../fixtures/recorded')
const raw = (file: string) => readFileSync(path.join(RECORDED, file), 'utf8')

describe('the hero receipt', () => {
  const run = goldenRun()

  it('adds up to what the recorded leaky run would have leaked', () => {
    const leaky = regrade((JSON.parse(raw('01-checkout-leaky.json')) as { run: SavedRun }).run)
    const total = run.before.reduce((sum, line) => sum + line.amountCents, 0)
    expect(total).toBe(-(leaky.merchantLeakCents + leaky.customerHarmCents))
    expect(run.before.every((line) => line.verdict === 'leak' && line.amountCents < 0)).toBe(true)
  })

  it('seals to $0.00, and says so honestly where a check could not decide', () => {
    expect(run.after.reduce((sum, line) => sum + line.amountCents, 0)).toBe(0)
    expect(run.after.some((line) => line.verdict === 'leak')).toBe(false)
    const echo = run.after.find((line) => line.personaId === 'echo')
    expect(echo?.verdict).toBe('inconclusive')
    expect(echo?.evidence).toContain('PayPal-signed events')
  })

  it('quotes only IDs that appear in the recorded ledgers', () => {
    const ledgers = raw('01-checkout-leaky.json') + raw('02-checkout-sealed.json')
    for (const line of [...run.before, ...run.after]) {
      const id = line.evidence.match(/\b(?:[0-9A-Z]{17}|WH-[0-9A-Z]{12})\b/)?.[0]
      if (id) expect(ledgers).toContain(id)
    }
    expect(run.before.filter((line) => /[0-9A-Z]{17}|WH-/.test(line.evidence))).toHaveLength(4)
  })

  it('is labelled as a recording, with its date', () => {
    expect(run.source).toBe('recorded')
    expect(run.label).toMatch(/^Recorded sandbox run · [A-Z][a-z]{2} \d{1,2}, \d{4}$/)
  })
})

describe('the AI-decides-vs-code-decides exhibit', () => {
  const shown = exhibit()

  it('pairs a real support reply with the refunds PayPal recorded', () => {
    expect(shown.conversation.assistant.length).toBeGreaterThan(10)
    expect(shown.conversation.tools).toContain('create_refund')
    expect(shown.ledger.map((line) => line.id)).toEqual(['2GJ9612411983394X', '6F267674AC248814W'])
    expect(shown.ledger.every((line) => line.status === 'COMPLETED')).toBe(true)
    expect(raw('03-policy-leaky.json')).toContain(shown.conversation.customer)
  })

  it('shows no customer email', () => {
    expect(JSON.stringify(shown)).not.toMatch(/@example\.com/)
  })
})
