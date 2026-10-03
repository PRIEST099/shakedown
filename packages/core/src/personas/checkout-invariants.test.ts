import { describe, expect, it } from 'vitest'
import type { Invariant } from '../grader'
import type { LedgerView } from '../ledger'
import { Ledger } from '../ledger'
import { bouncerInvariants } from './bouncer'
import { cartShufflerInvariants } from './cart-shuffler'
import { doubleClickerInvariants } from './double-clicker'

const [oneCharge, oneShipment] = doubleClickerInvariants
const [withinCaptured] = cartShufflerInvariants
const [noShipWithoutPayment] = bouncerInvariants

/** A ledger built by hand, entry by entry, as the engine would have written it. */
function ledger(build: (record: Ledger) => void): LedgerView {
  const record = new Ledger(() => new Date('2026-10-04T00:00:00Z'))
  build(record)
  return record.view()
}

const checkout = (record: Ledger, paypalOrderId: string, extra: Record<string, unknown> = {}) =>
  record.checkoutOpened({
    email: 'customer@example.com',
    lines: [{ sku: 'LL-BTL-750', qty: 1 }],
    status: 201,
    storeOrderId: `LL-${paypalOrderId}`,
    paypalOrderId,
    amountCents: 3600,
    ...extra,
  })

const paypal = (
  record: Ledger,
  paypalOrderId: string,
  captures: [string, string, number][],
  status = 'COMPLETED',
) =>
  record.paypalRead({
    paypalOrderId,
    found: true,
    status,
    captures: captures.map(([id, captureStatus, amountCents]) => ({
      id,
      status: captureStatus,
      amountCents,
      currency: 'USD',
    })),
  })

const probe = (record: Ledger, shipments: [string, number][]) =>
  record.probed({
    orderId: 'LL-1',
    found: true,
    status: shipments.length ? 'fulfilled' : 'declined',
    fulfillmentCount: shipments.length,
    amountCents: 3600,
    currency: 'USD',
    shipments: shipments.map(([source, valueCents]) => ({ source, valueCents })),
  })

const verdict = (invariant: Invariant | undefined, view: LedgerView) => {
  if (!invariant) throw new Error('missing invariant')
  return invariant.evaluate(view)
}

describe('Double-Clicker: one checkout is charged once', () => {
  it('leaks as customer harm when two submits become two charges', () => {
    const result = verdict(
      oneCharge,
      ledger((r) => {
        checkout(r, 'PP-1', { checkoutKey: 'CK-1' })
        checkout(r, 'PP-2', { checkoutKey: 'CK-1' })
        paypal(r, 'PP-1', [['CAP-1', 'COMPLETED', 3600]])
        paypal(r, 'PP-2', [['CAP-2', 'COMPLETED', 3600]])
      }),
    )
    expect(result).toMatchObject({ verdict: 'leak', customerHarmCents: 3600 })
    expect(result.merchantLeakCents ?? 0).toBe(0)
    expect(result.evidence?.find((item) => item.label === 'PayPal orders opened')?.value).toBe(
      'PP-1, PP-2',
    )
  })

  it('is sealed when both submits come back to one order, charged once', () => {
    const result = verdict(
      oneCharge,
      ledger((r) => {
        checkout(r, 'PP-1', { checkoutKey: 'CK-1' })
        checkout(r, 'PP-1', { checkoutKey: 'CK-1', reused: true })
        paypal(r, 'PP-1', [['CAP-1', 'COMPLETED', 3600]])
      }),
    )
    expect(result.verdict).toBe('sealed')
  })

  it('is inconclusive when nothing was opened or nothing was charged', () => {
    expect(
      verdict(
        oneCharge,
        ledger(() => {}),
      ).verdict,
    ).toBe('inconclusive')
    expect(
      verdict(
        oneCharge,
        ledger((r) => {
          checkout(r, 'PP-1', { checkoutKey: 'CK-1' })
          paypal(r, 'PP-1', [['CAP-1', 'DECLINED', 3600]])
        }),
      ).verdict,
    ).toBe('inconclusive')
  })
})

describe('Double-Clicker: a retried capture never ships twice', () => {
  const retried = (shipments: [string, number][]) =>
    ledger((r) => {
      checkout(r, 'PP-1')
      r.captureAnswered({ paypalOrderId: 'PP-1', status: 200, answer: 'paid' })
      r.captureAnswered({ paypalOrderId: 'PP-1', status: 200, answer: 'paid' })
      probe(r, shipments)
      paypal(r, 'PP-1', [['CAP-1', 'COMPLETED', 3600]])
    })

  it('leaks the extra shipment as merchant loss', () => {
    const result = verdict(
      oneShipment,
      retried([
        ['checkout', 3600],
        ['checkout', 3600],
      ]),
    )
    expect(result).toMatchObject({ verdict: 'leak', merchantLeakCents: 3600 })
    expect(result.customerHarmCents ?? 0).toBe(0)
  })

  it('is sealed when one payment shipped once', () => {
    expect(verdict(oneShipment, retried([['checkout', 3600]])).verdict).toBe('sealed')
  })

  it("counts only the checkout's own shipments, leaving webhook repeats to the Echo", () => {
    expect(
      verdict(
        oneShipment,
        retried([
          ['checkout', 3600],
          ['webhook', 3600],
        ]),
      ).verdict,
    ).toBe('sealed')
  })

  it('is inconclusive without a completed capture or without shipment data', () => {
    expect(
      verdict(
        oneShipment,
        ledger((r) => {
          checkout(r, 'PP-1')
          paypal(r, 'PP-1', [], 'APPROVED')
        }),
      ).verdict,
    ).toBe('inconclusive')
    expect(
      verdict(
        oneShipment,
        ledger((r) => {
          checkout(r, 'PP-1')
          paypal(r, 'PP-1', [['CAP-1', 'COMPLETED', 3600]])
        }),
      ).verdict,
    ).toBe('inconclusive')
  })
})

describe('Cart Shuffler: goods shipped never outweigh what PayPal captured', () => {
  const shipped = (captured: number, shipments: [string, number][]) =>
    ledger((r) => {
      checkout(r, 'PP-1')
      probe(r, shipments)
      paypal(r, 'PP-1', captured ? [['CAP-1', 'COMPLETED', captured]] : [])
    })

  it('leaks the difference when cheap money buys dear goods', () => {
    expect(verdict(withinCaptured, shipped(100, [['checkout', 12400]]))).toMatchObject({
      verdict: 'leak',
      merchantLeakCents: 12300,
    })
  })

  it('is sealed when what shipped matches what was captured', () => {
    expect(verdict(withinCaptured, shipped(12400, [['checkout', 12400]])).verdict).toBe('sealed')
  })

  it('is sealed when the store held the order instead of shipping it', () => {
    const result = verdict(withinCaptured, shipped(100, []))
    expect(result.verdict).toBe('sealed')
    expect(result.detail).toMatch(/held/)
  })

  it('weighs each shipment on its own, leaving double shipping to the Double-Clicker', () => {
    expect(
      verdict(
        withinCaptured,
        shipped(1800, [
          ['checkout', 1800],
          ['checkout', 1800],
        ]),
      ).verdict,
    ).toBe('sealed')
  })

  it('is inconclusive when PayPal captured nothing', () => {
    expect(verdict(withinCaptured, shipped(0, [['checkout', 1800]])).verdict).toBe('inconclusive')
  })
})

describe('Bouncer: a declined card never ships anything', () => {
  const declined = (captureStatus: string, shipments: [string, number][]) =>
    ledger((r) => {
      checkout(r, 'PP-1')
      r.cardConfirmed({
        paypalOrderId: 'PP-1',
        decline: true,
        status: 200,
        orderStatus: 'APPROVED',
      })
      r.captureAnswered({
        paypalOrderId: 'PP-1',
        status: shipments.length ? 200 : 402,
        answer: shipments.length ? 'paid' : 'declined',
      })
      probe(r, shipments)
      paypal(r, 'PP-1', [['CAP-1', captureStatus, 3600]])
    })

  it('leaks what shipped when PayPal declined the capture', () => {
    const result = verdict(noShipWithoutPayment, declined('DECLINED', [['checkout', 3600]]))
    expect(result).toMatchObject({ verdict: 'leak', merchantLeakCents: 3600 })
    expect(result.detail).toMatch(/CAP-1 is DECLINED and nothing was paid.*"paid"/)
  })

  it('is sealed when the store declined and shipped nothing', () => {
    expect(verdict(noShipWithoutPayment, declined('DECLINED', [])).verdict).toBe('sealed')
  })

  it('is inconclusive when the card did not actually bounce', () => {
    expect(verdict(noShipWithoutPayment, declined('COMPLETED', [['checkout', 3600]])).verdict).toBe(
      'inconclusive',
    )
  })

  it("is inconclusive when PayPal's ledger was never read", () => {
    expect(
      verdict(
        noShipWithoutPayment,
        ledger((r) => checkout(r, 'PP-1')),
      ).verdict,
    ).toBe('inconclusive')
  })
})
