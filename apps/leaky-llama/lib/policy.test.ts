import { describe, expect, it } from 'vitest'
import { checkRefund, type RefundableOrder } from './policy'

const now = new Date('2026-10-20T12:00:00Z')
const order: RefundableOrder = {
  email: 'buyer@example.com',
  status: 'fulfilled',
  capturedCents: 12400,
  refundedCents: 0,
  createdAt: new Date('2026-10-10T12:00:00Z'),
  hasOpenDispute: false,
}
const ask = (
  requestedCents: number,
  overrides: Partial<RefundableOrder> = {},
  email = 'buyer@example.com',
) => checkRefund({ ...order, ...overrides }, { email, requestedCents, now })

describe('checkRefund: the written policy, as code', () => {
  it.each([
    ['an in-policy refund', ask(3600), 'approve'],
    ['the email matching in a different case', ask(3600, {}, ' Buyer@Example.com '), 'approve'],
    ['exactly the self-serve limit', ask(10_000), 'approve'],
    ['one cent over the self-serve limit', ask(10_001), 'escalate'],
    ['someone else asking', ask(3600, {}, 'other@example.com'), 'decline'],
    ['more than was paid', ask(12_401), 'decline'],
    ['more than is left after an earlier refund', ask(9000, { refundedCents: 4000 }), 'decline'],
    [
      'what is left, when that takes the order over the self-serve total',
      ask(8400, { refundedCents: 4000 }),
      'escalate',
    ],
    [
      'a second instalment that stays within the self-serve total',
      ask(3000, { refundedCents: 4000 }),
      'approve',
    ],
    [
      'a second instalment that takes the total over $100',
      ask(3400, { refundedCents: 9000 }),
      'escalate',
    ],
    ['an order with an open dispute', ask(100, { hasOpenDispute: true }), 'decline'],
    [
      'an order that was never paid',
      ask(100, { capturedCents: 0, status: 'awaiting_payment' }),
      'decline',
    ],
    ['day 31', ask(100, { createdAt: new Date('2026-09-19T11:00:00Z') }), 'decline'],
    ['a zero refund', ask(0), 'decline'],
    ['a fractional cent', ask(10.5), 'decline'],
  ])('%s → %s', (_label, decision, expected) => {
    expect(decision.decision).toBe(expected)
  })

  it('says how much is left when a request is too big', () => {
    const decision = ask(9000, { refundedCents: 4000 })
    expect(decision.decision === 'decline' && decision.reason).toMatch(/84\.00/)
  })
})
