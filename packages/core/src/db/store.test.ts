import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCampaign } from '../runner'
import type { FixtureTarget } from '../testing/fixture-target'
import { LEAKY, startFixtureTarget } from '../testing/fixture-target'
import type { Database } from './client'
import { createDb } from './client'
import { campaigns, findings, invariantResults, ledgerEntries, scenarioRuns } from './schema'
import { saveCampaign } from './store'

/**
 * Needs a Postgres to talk to. Run `pnpm db:up` and `pnpm --filter @shakedown/core db:migrate`,
 * then set DATABASE_URL. Without one the suite skips rather than pretending to have checked.
 */
const url = process.env.DATABASE_URL

describe.skipIf(!url)('saveCampaign', () => {
  let fixture: FixtureTarget
  let db: Database
  let close: () => Promise<void>

  beforeAll(async () => {
    fixture = await startFixtureTarget({ flags: LEAKY })
    const created = createDb(url as string)
    db = created.db
    close = () => created.client.end()
  })

  afterAll(async () => {
    await fixture.close()
    await close?.()
  })

  it('stores a whole run, ledger and all, and reads it back', async () => {
    const result = await runCampaign({ target: fixture.adapter, cast: ['echo'], seed: 7 })
    await saveCampaign(db, result)

    const [stored] = await db.select().from(campaigns)
    expect(stored?.id).toBe(result.campaignId)
    expect(stored?.seed).toBe(result.seed)
    expect(stored?.merchantLeakCents).toBe(result.merchantLeakCents)

    expect(await db.select().from(scenarioRuns)).toHaveLength(result.outcomes.length)
    expect(await db.select().from(findings)).toHaveLength(result.findings.length)
    expect((await db.select().from(ledgerEntries)).length).toBe(
      result.outcomes.reduce((sum, outcome) => sum + outcome.entries.length, 0),
    )
    expect((await db.select().from(invariantResults)).length).toBe(
      result.outcomes.reduce((sum, outcome) => sum + outcome.results.length, 0),
    )

    // Deleting the campaign takes its evidence with it.
    await db.delete(campaigns)
    expect(await db.select().from(ledgerEntries)).toHaveLength(0)
  })
})
