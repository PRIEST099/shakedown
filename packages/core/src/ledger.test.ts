import { describe, expect, it } from 'vitest'
import { Ledger } from './ledger'
import { captureCompleted } from './webhook'

const at = (ms: number) => new Date(1_700_000_000_000 + ms)

const event = captureCompleted({
  id: 'WH-1',
  orderId: 'ORD-1',
  captureId: 'CAP-1',
  amountCents: 4200,
  createTime: at(0),
})

describe('Ledger', () => {
  it('records what the engine did, in order, with a timestamp on every entry', () => {
    let tick = 0
    const ledger = new Ledger(() => {
      tick += 1000
      return at(tick)
    })
    ledger.orderOpened({ orderId: 'ORD-1', captureId: 'CAP-1', amountCents: 4200, currency: 'USD' })
    ledger.delivered(event, { signed: false, status: 200, accepted: true })
    ledger.probed({
      orderId: 'ORD-1',
      found: true,
      status: 'fulfilled',
      fulfillmentCount: 1,
      amountCents: 4200,
      currency: 'USD',
    })
    ledger.noted('the persona said something')

    const view = ledger.view()
    expect(view.entries.map((entry) => entry.kind)).toEqual([
      'order-opened',
      'delivery',
      'probe',
      'note',
    ])
    expect(view.entries.every((entry) => typeof entry.at === 'string')).toBe(true)
  })

  it('copies the identifying fields off the event so evidence can quote them', () => {
    const ledger = new Ledger(() => at(0))
    ledger.delivered(event, { signed: true, status: 401, accepted: false })
    const [delivery] = ledger.view().deliveries()
    expect(delivery).toMatchObject({
      eventId: 'WH-1',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      orderId: 'ORD-1',
      signed: true,
      status: 401,
      accepted: false,
    })
  })

  it('hands the grader a snapshot that cannot be edited', () => {
    const ledger = new Ledger(() => at(0))
    ledger.noted('one')
    const view = ledger.view()
    ledger.noted('two')
    expect(view.entries).toHaveLength(1)
    expect(() => (view.entries as unknown as unknown[]).push({})).toThrow()
    expect(ledger.size).toBe(2)
  })

  it('answers the questions invariants actually ask', () => {
    const ledger = new Ledger(() => at(0))
    ledger.orderOpened({ orderId: 'ORD-1', captureId: 'CAP-1', amountCents: 4200, currency: 'USD' })
    ledger.delivered(event, { signed: false, status: 200, accepted: true })
    ledger.delivered(event, { signed: true, status: 200, accepted: true })
    for (const count of [0, 1, 2]) {
      ledger.probed({
        orderId: 'ORD-1',
        found: true,
        status: count ? 'fulfilled' : 'pending',
        fulfillmentCount: count,
        amountCents: 4200,
        currency: 'USD',
      })
    }
    const view = ledger.view()
    expect(view.order()?.orderId).toBe('ORD-1')
    expect(view.deliveries((entry) => !entry.signed)).toHaveLength(1)
    expect(view.probes('ORD-1')).toHaveLength(3)
    expect(view.probes('ORD-OTHER')).toHaveLength(0)
    expect(view.lastProbe()?.fulfillmentCount).toBe(2)
  })
})
