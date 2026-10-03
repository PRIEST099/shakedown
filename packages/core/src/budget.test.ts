import { describe, expect, it } from 'vitest'
import { Budget, BudgetExceededError } from './budget'

describe('Budget', () => {
  it('stops the run rather than hammering a target', () => {
    const budget = new Budget({ requests: 3 })
    budget.spend('requests')
    budget.spend('requests')
    budget.spend('requests')
    expect(() => budget.spend('requests')).toThrow(BudgetExceededError)
    expect(budget.spent.requests).toBe(3)
  })

  it('refuses a spend that would overshoot, instead of part-spending', () => {
    const budget = new Budget({ aiTokens: 100 })
    budget.spend('aiTokens', 90)
    expect(() => budget.spend('aiTokens', 20)).toThrow(/aiTokens/)
    expect(budget.spent.aiTokens).toBe(90)
  })

  it('enforces the wall clock on every spend', () => {
    let now = 0
    const budget = new Budget({ wallClockMs: 1000 }, () => now)
    budget.spend('requests')
    now = 1001
    expect(() => budget.spend('requests')).toThrow(/wallClockMs/)
    expect(() => budget.checkClock()).toThrow(BudgetExceededError)
  })

  it('names the resource that ran out', () => {
    const budget = new Budget({ requests: 0 })
    try {
      budget.spend('requests')
      expect.unreachable()
    } catch (error) {
      expect((error as BudgetExceededError).resource).toBe('requests')
      expect((error as BudgetExceededError).code).toBe('BUDGET_EXCEEDED')
    }
  })
})
