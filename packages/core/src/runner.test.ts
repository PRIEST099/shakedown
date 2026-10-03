import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunEvent } from './events'
import { EventBus } from './events'
import type { PersonaModule, Scenario } from './persona'
import { CampaignCancelledError, runCampaign } from './runner'
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
  it('reports the seed it used, so any run can be replayed', async () => {
    const result = await runCampaign({ target: fixture.adapter, cast: ['echo'] })
    expect(typeof result.seed).toBe('number')
    expect(result.campaignId).toMatch(/^CMP-/)
    expect(result.target).toBe(fixture.adapter.origin)
  })

  it('skips personas that are not wired up yet instead of failing', async () => {
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['bouncer', 'policy-lawyer'],
      seed: 1,
    })
    expect(result.outcomes).toEqual([])
    expect(result.findings).toEqual([])
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
