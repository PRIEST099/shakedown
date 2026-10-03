import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { RunEvent } from '../events'
import { EventBus } from '../events'
import type { CampaignResult } from '../runner'
import { runCampaign } from '../runner'
import type { FixtureFlags, FixtureTarget } from '../testing/fixture-target'
import { LEAKY, SEALED, startFixtureTarget } from '../testing/fixture-target'

let fixture: FixtureTarget

beforeAll(async () => {
  fixture = await startFixtureTarget({ flags: LEAKY })
})

afterAll(async () => {
  await fixture.close()
})

beforeEach(() => {
  fixture.reset()
})

/** A clock that ticks a second per read, so a seeded run is reproducible down to the byte. */
const fixedClock = () => {
  let tick = 0
  return () => {
    tick += 1000
    return new Date(Date.UTC(2026, 9, 3) + tick)
  }
}

const run = (
  flags: FixtureFlags,
  options: { seed?: number; bus?: EventBus; now?: () => Date } = {},
): Promise<CampaignResult> => {
  fixture.setFlags(flags)
  return runCampaign({
    target: fixture.adapter,
    cast: ['echo'],
    seed: options.seed ?? 2026,
    bus: options.bus,
    now: options.now,
  })
}

describe('The Echo, end to end against a fixture listener', () => {
  it('finds one leak per property when the listener is left as people ship it', async () => {
    const result = await run(LEAKY)

    expect(result.findings).toHaveLength(3)
    for (const outcome of result.outcomes) {
      expect(outcome.findings, `${outcome.scenario} should raise exactly one finding`).toHaveLength(
        1,
      )
      expect(outcome.error).toBeUndefined()
    }
    expect(result.findings.map((finding) => finding.invariant).sort()).toEqual([
      'echo.duplicate-event-once',
      'echo.no-state-regression',
      'echo.unsigned-event-ignored',
    ])
    expect(result.merchantLeakCents).toBeGreaterThan(0)
  })

  it('finds nothing once the listener is sealed', async () => {
    const result = await run(SEALED)

    expect(result.findings).toEqual([])
    const verdicts = result.outcomes.flatMap((outcome) =>
      outcome.results.map((entry) => entry.result.verdict),
    )
    expect(verdicts).toEqual(['sealed', 'sealed', 'sealed'])
    expect(result.merchantLeakCents).toBe(0)
  })

  it('pins each finding to the one property that is wrong', async () => {
    const cases: Array<[keyof FixtureFlags, string]> = [
      ['verifySignature', 'echo.unsigned-event-ignored'],
      ['dedupeEvents', 'echo.duplicate-event-once'],
      ['guardEventOrder', 'echo.no-state-regression'],
    ]
    for (const [flag, invariant] of cases) {
      fixture.reset()
      const result = await run({ ...SEALED, [flag]: false })
      expect(
        result.findings.map((finding) => finding.invariant),
        `only ${flag} is wrong`,
      ).toEqual([invariant])
    }
  })

  it('quotes real event and order identifiers as evidence', async () => {
    const result = await run(LEAKY)

    for (const outcome of result.outcomes) {
      const finding = outcome.findings[0]
      expect(finding).toBeDefined()
      const deliveredIds = outcome.entries
        .filter((entry) => entry.kind === 'delivery')
        .map((entry) => entry.eventId)
      const openedOrder = outcome.entries.find((entry) => entry.kind === 'order-opened')

      const quotedEvent =
        finding?.evidence.find((item) => item.label.includes('Event ID')) ??
        finding?.evidence.find((item) => item.label.includes('event ID'))
      expect(deliveredIds).toContain(quotedEvent?.value)
      expect(quotedEvent?.value).toMatch(/^WH-[0-9A-F]{12}$/)

      const quotedOrder = finding?.evidence.find((item) => item.label === 'Order ID')
      expect(quotedOrder?.value).toBe(openedOrder?.orderId)
    }
  })

  it('bills the merchant leak at the real order amounts', async () => {
    const result = await run(LEAKY)

    for (const outcome of result.outcomes) {
      const opened = outcome.entries.find((entry) => entry.kind === 'order-opened')
      expect(outcome.findings[0]?.merchantLeakCents).toBe(opened?.amountCents)
    }
  })

  it('replays identically from the same seed and clock', async () => {
    const first = await run(LEAKY, { seed: 99, now: fixedClock() })
    fixture.reset()
    const second = await run(LEAKY, { seed: 99, now: fixedClock() })

    expect(second.campaignId).toBe(first.campaignId)
    expect(second.findings).toEqual(first.findings)
  })

  it('streams the run so a console can draw it live', async () => {
    const bus = new EventBus()
    const seen: RunEvent[] = []
    bus.on((event) => seen.push(event))
    await run(LEAKY, { bus })

    const types = seen.map((event) => event.type)
    expect(types[0]).toBe('campaign:started')
    expect(types.at(-1)).toBe('campaign:finished')
    expect(types.filter((type) => type === 'scenario:started')).toHaveLength(3)
    expect(types.filter((type) => type === 'finding')).toHaveLength(3)
    const finished = seen.at(-1)
    expect(finished?.type === 'campaign:finished' && finished.findings).toBe(3)
  })

  it('reports what it planned to do even before it does it', async () => {
    const result = await run(SEALED)
    for (const outcome of result.outcomes) {
      expect(outcome.plan.length).toBeGreaterThanOrEqual(3)
      expect(outcome.title).toBeTruthy()
    }
  })
})
