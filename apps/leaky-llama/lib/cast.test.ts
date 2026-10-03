import { type CampaignResult, fingerprint, type PersonaId, runCampaign } from '@shakedown/core'
import { allLeaky, allSealed, type StoreMode } from '@shakedown/core/mode'
import { describe, expect, it } from 'vitest'
import { createPgliteDb } from './db/client'
import { FakePayPal } from './testing/fake-paypal'
import { inProcessStore } from './testing/in-process-target'

/**
 * The cast against Leaky Llama's own code, in-process, with the fake PayPal. Each campaign gets
 * a fresh database so order numbers, and therefore everything the store reports, repeat exactly.
 */
const CAST: PersonaId[] = ['double-clicker', 'cart-shuffler', 'echo', 'bouncer']

async function campaign(mode: StoreMode, seed = 2026): Promise<CampaignResult> {
  const db = await createPgliteDb()
  const { target, paypal } = inProcessStore({ db, paypal: new FakePayPal() }, mode)
  return runCampaign({ target, paypal, cast: CAST, seed })
}

const findingsBy = (result: CampaignResult) =>
  Object.fromEntries(
    CAST.map((id) => [
      id,
      result.findings.filter((finding) => finding.persona === id).map((f) => f.invariant),
    ]),
  )

describe('the cast against Leaky Llama', () => {
  it('finds every leak when every switch is leaky', async () => {
    const result = await campaign(allLeaky())
    expect(result.outcomes.every((outcome) => !outcome.error && !outcome.skipped)).toBe(true)
    expect(findingsBy(result)).toEqual({
      'double-clicker': [
        'double-clicker.one-checkout-one-charge',
        'double-clicker.one-payment-one-shipment',
      ],
      'cart-shuffler': [
        'cart-shuffler.shipped-within-captured',
        'cart-shuffler.shipped-within-captured',
      ],
      echo: [
        'echo.unsigned-event-ignored',
        'echo.duplicate-event-once',
        'echo.no-state-regression',
      ],
      bouncer: ['bouncer.no-ship-without-payment'],
    })
  })

  it('keeps merchant leak and customer harm apart', async () => {
    const result = await campaign(allLeaky())
    const doubleCharge = result.findings.find(
      (f) => f.invariant === 'double-clicker.one-checkout-one-charge',
    )
    const doubleShip = result.findings.find(
      (f) => f.invariant === 'double-clicker.one-payment-one-shipment',
    )
    expect(doubleCharge).toMatchObject({ merchantLeakCents: 0 })
    expect(doubleCharge?.customerHarmCents).toBeGreaterThan(0)
    expect(doubleShip).toMatchObject({ customerHarmCents: 0 })
    expect(doubleShip?.merchantLeakCents).toBeGreaterThan(0)
    expect(result.customerHarmCents).toBe(doubleCharge?.customerHarmCents)
  })

  it('prices the Cart Shuffler leaks from the catalog and the captured amounts', async () => {
    const result = await campaign(allLeaky())
    const amounts = result.findings
      .filter((f) => f.persona === 'cart-shuffler')
      .map((f) => [f.scenario, f.merchantLeakCents])
    // Panniers ($124.00) for $1.00, then two panniers ($248.00) for socks ($18.00).
    expect(amounts).toEqual([
      ['cart-shuffler.own-price', 12300],
      ['cart-shuffler.swap-after-approval', 23000],
    ])
  })

  it('finds nothing once every switch is sealed', async () => {
    const result = await campaign(allSealed())
    expect(result.findings).toEqual([])
    const verdicts = result.outcomes.flatMap((outcome) =>
      outcome.results.map((entry) => entry.result.verdict),
    )
    expect(verdicts.every((verdict) => verdict === 'sealed')).toBe(true)
    expect(verdicts).toHaveLength(8)
  })

  it('repeats itself exactly from the same seed', async () => {
    const [first, second] = [await campaign(allLeaky(), 7), await campaign(allLeaky(), 7)]
    expect(fingerprint(second)).toEqual(fingerprint(first))
  })

  it.each([['double-clicker' as const], ['cart-shuffler' as const], ['bouncer' as const]])(
    'sealing only the %s switch clears that persona and nobody else',
    async (persona) => {
      const leaky = findingsBy(await campaign(allLeaky()))
      const result = findingsBy(await campaign({ ...allLeaky(), [persona]: 'sealed' }))
      expect(result[persona]).toEqual([])
      for (const other of CAST.filter((id) => id !== persona)) {
        expect(result[other], `${other} should be unchanged`).toEqual(leaky[other])
      }
    },
  )

  it('still reports a duplicate webhook applied twice when idempotent fulfilment stops it shipping twice', async () => {
    const result = await campaign({ ...allLeaky(), 'double-clicker': 'sealed' })
    const duplicate = result.findings.find((f) => f.invariant === 'echo.duplicate-event-once')
    expect(duplicate).toMatchObject({ severity: 'medium', merchantLeakCents: 0 })
    expect(duplicate?.detail).toMatch(/applied it twice.*shipped once/)
  })
})
