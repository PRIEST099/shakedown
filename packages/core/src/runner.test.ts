import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunEvent } from './events'
import { EventBus } from './events'
import type { PersonaModule, Scenario } from './persona'
import { CampaignCancelledError, runCampaign } from './runner'
import { regrade, saveRun } from './saved-run'
import type { FixtureTarget } from './testing/fixture-target'
import { LEAKY, startFixtureTarget } from './testing/fixture-target'

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

const scenario = (id: string, act: Scenario['act']): Scenario => ({
  id,
  persona: 'echo',
  title: id,
  plan: ['do the thing'],
  act,
  invariants: [],
})

const moduleWith = (...scenarios: Scenario[]): Partial<Record<'echo', PersonaModule>> => ({
  echo: { id: 'echo', scenarios },
})

describe('runCampaign', () => {
  it("never lets one scenario's findings change what the next one says", async () => {
    // Two scenarios that each draw from the campaign's random stream. Whether the first raises a
    // finding must not change what the second draws.
    const drawn: string[] = []
    const scenarioPair = (leaks: boolean): Partial<Record<'echo', PersonaModule>> => ({
      echo: {
        id: 'echo',
        scenarios: [
          {
            ...scenario('first', async (context) => {
              drawn.push(context.rng.id('A'))
            }),
            invariants: leaks
              ? [
                  {
                    id: 'always-leaks',
                    persona: 'echo',
                    title: 'x',
                    severity: 'high',
                    fix: 'x',
                    evaluate: () => ({ verdict: 'leak', detail: 'x' }),
                  },
                ]
              : [],
          },
          scenario('second', async (context) => {
            drawn.push(context.rng.id('B'))
          }),
        ],
      },
    })
    await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 5,
      modules: scenarioPair(false),
    })
    await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 5,
      modules: scenarioPair(true),
    })
    expect(drawn[1]).toBe(drawn[3])
  })

  it('runs a cast one customer at a time, each resuming the last, exactly as one run would', async () => {
    const leaks = {
      id: 'always-leaks',
      persona: 'echo' as const,
      title: 'x',
      severity: 'high' as const,
      fix: 'x',
      evaluate: () => ({ verdict: 'leak' as const, detail: 'x', merchantLeakCents: 100 }),
    }
    const drawing = (persona: 'echo' | 'bouncer'): PersonaModule => ({
      id: persona,
      scenarios: [
        {
          ...scenario(`${persona}-draws`, async (context) => {
            context.step(`${context.rng.id('A')} ${context.rng.int(1000)}`)
          }),
          persona,
          invariants: [{ ...leaks, persona }],
        },
      ],
    })
    const modules = { echo: drawing('echo'), bouncer: drawing('bouncer') }
    const common = { target: fixture.adapter, seed: 11, campaignId: 'CMP-STEPS', modules }
    const lines = (result: { outcomes: { entries: readonly { kind: string }[] }[] }) =>
      result.outcomes.flatMap((outcome) =>
        outcome.entries.map((entry) => ('detail' in entry ? entry.detail : entry.kind)),
      )

    const whole = await runCampaign({ ...common, cast: ['echo', 'bouncer'] })
    const first = await runCampaign({ ...common, cast: ['echo'] })
    const second = await runCampaign({ ...common, cast: ['bouncer'], resume: first.streams })

    expect([...lines(first), ...lines(second)]).toEqual(lines(whole))
    expect([...first.findings, ...second.findings].map((f) => f.id)).toEqual(
      whole.findings.map((f) => f.id),
    )
    expect(second.streams).toEqual(whole.streams)
    await expect(
      runCampaign({ ...common, campaignId: undefined, cast: ['bouncer'], resume: first.streams }),
    ).rejects.toThrow(/campaignId/)
  })

  it('judges a saved run again, identically, without sending anything', async () => {
    const result = await runCampaign({ target: fixture.adapter, cast: ['echo'], seed: 3 })
    const saved = JSON.parse(JSON.stringify(saveRun(result)))
    const before = fixture.orders().length
    const again = regrade(saved)
    expect(fixture.orders()).toHaveLength(before)
    expect(again.findings.map((f) => [f.invariant, f.merchantLeakCents])).toEqual(
      result.findings.map((f) => [f.invariant, f.merchantLeakCents]),
    )
  })

  it('reports the seed it used, so any run can be replayed', async () => {
    const result = await runCampaign({ target: fixture.adapter, cast: ['echo'] })
    expect(typeof result.seed).toBe('number')
    expect(result.campaignId).toMatch(/^CMP-/)
    expect(result.target).toBe(fixture.adapter.origin)
  })

  it('skips personas that are not wired up yet instead of failing', async () => {
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['second-opinion'],
      seed: 1,
    })
    expect(result.outcomes).toEqual([])
    expect(result.findings).toEqual([])
  })

  it('skips a scenario the target cannot support, and says why, without running it', async () => {
    const bus = new EventBus()
    const seen: RunEvent[] = []
    bus.on((event) => seen.push(event))
    // The fixture is a bare webhook listener: no checkout, and no PayPal side in this campaign.
    const result = await runCampaign({ target: fixture.adapter, cast: ['bouncer'], seed: 1, bus })
    expect(result.outcomes).toHaveLength(1)
    expect(result.outcomes[0]).toMatchObject({ persona: 'bouncer', results: [], entries: [] })
    expect(result.outcomes[0]?.skipped).toMatch(/checkout to walk through.*PayPal/)
    expect(seen.map((event) => event.type)).toContain('scenario:skipped')
    expect(fixture.orders()).toHaveLength(0)
  })

  it('stops when the operator cancels, and says so', async () => {
    const controller = new AbortController()
    const bus = new EventBus()
    bus.on((event) => {
      if (event.type === 'scenario:finished') controller.abort()
    })
    const seen: RunEvent[] = []
    bus.on((event) => seen.push(event))

    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 1,
      bus,
      signal: controller.signal,
    })

    expect(result.stoppedEarly).toBe(new CampaignCancelledError().message)
    expect(result.outcomes).toHaveLength(1)
    expect(seen.some((event) => event.type === 'campaign:failed')).toBe(true)
    expect(seen.some((event) => event.type === 'campaign:finished')).toBe(false)
  })

  it('stops when the budget runs out, keeping what it already learned', async () => {
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 1,
      budget: { requests: 2 },
    })
    expect(result.stoppedEarly).toMatch(/requests limit/)
    expect(result.outcomes).toHaveLength(1)
    expect(result.outcomes[0]?.error).toMatch(/requests limit/)
    // Two calls were made and both are on the record.
    expect(result.outcomes[0]?.entries.filter((entry) => entry.kind !== 'note')).toHaveLength(2)
  })

  it('keeps a broken scenario from taking the campaign down with it', async () => {
    const good = vi.fn(async () => {})
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 1,
      modules: moduleWith(
        scenario('boom', async () => {
          throw new Error('the target hung up')
        }),
        scenario('fine', good),
      ),
    })

    expect(result.outcomes.map((outcome) => outcome.error)).toEqual([
      'the target hung up',
      undefined,
    ])
    expect(good).toHaveBeenCalledOnce()
    expect(result.stoppedEarly).toBeUndefined()
  })

  it('gives every scenario its own ledger, so evidence never bleeds across them', async () => {
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 1,
      modules: moduleWith(
        scenario('first', async (context) => {
          await context.target.openOrder({ amountCents: 100 })
        }),
        scenario('second', async (context) => {
          await context.target.openOrder({ amountCents: 200 })
        }),
      ),
    })
    expect(result.outcomes.map((outcome) => outcome.entries.length)).toEqual([1, 1])
    const amounts = result.outcomes.map(
      (outcome) => outcome.entries.find((entry) => entry.kind === 'order-opened')?.amountCents,
    )
    expect(amounts).toEqual([100, 200])
  })

  it('records a persona note without letting it reach the grader', async () => {
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 1,
      modules: moduleWith(
        scenario('notes', async (context) => {
          context.step('I would like to speak to the manager')
        }),
      ),
    })
    expect(result.outcomes[0]?.entries).toEqual([
      expect.objectContaining({ kind: 'note', detail: 'I would like to speak to the manager' }),
    ])
    expect(result.findings).toEqual([])
  })
})
