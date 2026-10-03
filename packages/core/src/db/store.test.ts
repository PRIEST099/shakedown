import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCampaign } from '../runner'
import type { FixtureTarget } from '../testing/fixture-target'
import { LEAKY, startFixtureTarget } from '../testing/fixture-target'
import type { Database } from './client'
import {
  campaigns,
  findings,
  invariantResults,
  ledgerEntries,
  scenarioRuns,
  schema,
} from './schema'
import { saveCampaign } from './store'

/**
 * Runs the real migration against a real Postgres: PGlite, which is Postgres compiled to
 * WebAssembly, so the test needs no Docker and no DATABASE_URL.
 */
describe('saveCampaign', () => {
  let fixture: FixtureTarget
  let db: Database

  beforeAll(async () => {
    fixture = await startFixtureTarget({ flags: LEAKY })
    const pg = drizzle(new PGlite(), { schema })
    await migrate(pg, { migrationsFolder: path.resolve(import.meta.dirname, '../../drizzle') })
    db = pg as unknown as Database
  })

  afterAll(async () => {
    await fixture.close()
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
  })

  it('keeps the evidence quotable: a stored finding still points at real event IDs', async () => {
    const [finding] = await db.select().from(findings)
    const eventId = finding?.evidence.find((item) => item.label === 'Event ID')?.value
    expect(eventId).toMatch(/^WH-[0-9A-F]{12}$/)
  })

  it('takes the evidence with it when a campaign is deleted', async () => {
    await db.delete(campaigns)
    expect(await db.select().from(ledgerEntries)).toHaveLength(0)
    expect(await db.select().from(findings)).toHaveLength(0)
  })
})
