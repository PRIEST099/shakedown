import type { CampaignResult } from '@shakedown/core'
import { runCampaign } from '@shakedown/core'
import type { FixtureTarget } from '@shakedown/core/testing'
import { LEAKY, SEALED, startFixtureTarget } from '@shakedown/core/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { scoreboard } from './scoreboard'

let fixture: FixtureTarget

beforeAll(async () => {
  process.env.NO_COLOR = '1'
  fixture = await startFixtureTarget({ flags: LEAKY })
})

afterAll(async () => {
  await fixture.close()
  delete process.env.NO_COLOR
})

beforeEach(() => fixture.reset())

const run = (flags: typeof LEAKY): Promise<CampaignResult> => {
  fixture.setFlags(flags)
  return runCampaign({ target: fixture.adapter, cast: ['echo'], seed: 2026 })
}

describe('scoreboard', () => {
  it('prints a red receipt with the money and the fix on it', async () => {
    const text = scoreboard(await run(LEAKY))

    expect(text).toContain('3. THE ECHO')
    expect(text).toContain('3 LEAKS')
    expect(text).toContain('MERCHANT LEAK')
    expect(text).toMatch(/\$\d+\.\d{2}/)
    expect(text).toContain('Fix: Call verify-webhook-signature')
    expect(text).toContain('✗ An unverified webhook never releases goods')
  })

  it('prints a sealed receipt with every property that held', async () => {
    const text = scoreboard(await run(SEALED))

    expect(text).toContain('SEALED')
    expect(text).toContain('$0.00')
    expect(text).not.toContain('✗')
    expect(text.match(/✓/g)).toHaveLength(3)
  })

  it('can hide the properties that held, for a short report', async () => {
    const text = scoreboard(await run(SEALED), { showSealed: false })
    expect(text).not.toContain('✓')
    expect(text).toContain('SEALED')
  })

  it('quotes every piece of evidence verbatim', async () => {
    const result = await run(LEAKY)
    const text = scoreboard(result)
    for (const finding of result.findings) {
      for (const item of finding.evidence) {
        expect(text).toContain(item.value)
      }
    }
  })

  it('says when a run stopped early', async () => {
    fixture.setFlags(LEAKY)
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['echo'],
      seed: 1,
      budget: { requests: 2 },
    })
    expect(scoreboard(result)).toContain('Stopped early:')
  })
})
