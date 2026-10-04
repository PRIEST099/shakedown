import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { type CampaignResult, regrade, type SavedRun, type StoreMode } from '@shakedown/core'
import {
  campaigns,
  type Database,
  findings,
  invariantResults,
  ledgerEntries,
  type SaveCampaignOptions,
  saveCampaign,
  scenarioRuns,
  schema,
} from '@shakedown/core/db'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import type { CampaignSource, StoredCampaign } from './rows'

/**
 * The console's campaign store: Shakedown's own schema (packages/core/src/db). With
 * CONSOLE_DATABASE_URL unset it runs on PGlite, a real Postgres in-process, so local development
 * needs no Docker. An empty store is seeded with real recorded runs, so the console never opens
 * blank and never shows invented numbers.
 */

const MIGRATIONS = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  '../../packages/core/drizzle',
)
const RECORDED = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'fixtures/recorded')

async function open(): Promise<Database> {
  const url = process.env.CONSOLE_DATABASE_URL?.trim()
  if (url) {
    const db = drizzlePostgres(postgres(url, { max: 5 }), { schema })
    await migratePostgres(db, { migrationsFolder: MIGRATIONS })
    return db as unknown as Database
  }
  // One PGlite directory per server process: two servers must never share one.
  // Runtime data, not part of the build: keep it out of the output-file trace.
  const dir = path.resolve(
    /* turbopackIgnore: true */ process.env.CONSOLE_DATA_DIR?.trim() || '.data/pglite-console',
  )
  mkdirSync(dir, { recursive: true })
  const db = drizzlePglite(new PGlite(dir), { schema })
  await migratePglite(db, { migrationsFolder: MIGRATIONS })
  return db as unknown as Database
}

// One database per server process. Next's dev server reloads modules, so keep it on globalThis.
const holder = globalThis as unknown as { __shakedownConsoleDb?: Promise<Database> }

export function getConsoleDb(): Promise<Database> {
  if (!holder.__shakedownConsoleDb) {
    holder.__shakedownConsoleDb = open().then(async (db) => {
      await seedRecordedRuns(db)
      return db
    })
    holder.__shakedownConsoleDb.catch(() => {
      holder.__shakedownConsoleDb = undefined
    })
  }
  return holder.__shakedownConsoleDb
}

/** A recorded run as committed in fixtures/recorded: the ledger plus how the store was set. */
interface RecordedRun {
  /** The store's switches for the run, read from the campaign token or the shipped build. */
  switches: 'leaky' | 'sealed'
  /** What made the recording, for anyone reading the fixture. */
  note: string
  run: SavedRun
}

const fill = (seal: 'leaky' | 'sealed'): StoreMode =>
  Object.fromEntries(
    ['double-clicker', 'cart-shuffler', 'echo', 'bouncer', 'policy-lawyer', 'second-opinion'].map(
      (id) => [id, seal],
    ),
  ) as StoreMode

export async function seedRecordedRuns(db: Database, dir = RECORDED): Promise<number> {
  const [existing] = await db.select({ id: campaigns.id }).from(campaigns).limit(1)
  if (existing || !existsSync(dir)) return 0
  let count = 0
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()) {
    const recorded = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as RecordedRun
    // Judged by today's graders: a recording keeps what happened, not what we concluded.
    await storeCampaign(db, regrade(recorded.run), {
      source: 'recorded',
      switches: fill(recorded.switches),
    })
    count += 1
  }
  return count
}

/**
 * Store a finished campaign under an ID nothing else holds. Campaign IDs come from the seed, so
 * two runs with the same seed would otherwise collide.
 */
export async function storeCampaign(
  db: Database,
  result: CampaignResult,
  options: SaveCampaignOptions = {},
): Promise<string> {
  let id = result.campaignId
  for (let n = 2; ; n += 1) {
    const [taken] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)
    if (!taken) break
    id = `${result.campaignId}-${n}`
  }
  const rekeyed: CampaignResult =
    id === result.campaignId
      ? result
      : {
          ...result,
          campaignId: id,
          findings: result.findings.map((finding) => ({ ...finding, campaignId: id })),
          outcomes: result.outcomes.map((outcome) => ({
            ...outcome,
            findings: outcome.findings.map((finding) => ({ ...finding, campaignId: id })),
          })),
        }
  await saveCampaign(db, rekeyed, options)
  return id
}

/** The most recent campaigns, ledger and all. */
export async function loadCampaigns(db: Database, limit = 50): Promise<StoredCampaign[]> {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.startedAt)).limit(limit)
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const runs = await db
    .select()
    .from(scenarioRuns)
    .where(inArray(scenarioRuns.campaignId, ids))
    .orderBy(asc(scenarioRuns.position))
  const runIds = runs.map((run) => run.id)
  const [entries, checks, found] = runIds.length
    ? await Promise.all([
        db
          .select()
          .from(ledgerEntries)
          .where(inArray(ledgerEntries.scenarioRunId, runIds))
          .orderBy(asc(ledgerEntries.position)),
        db.select().from(invariantResults).where(inArray(invariantResults.scenarioRunId, runIds)),
        db.select().from(findings).where(inArray(findings.scenarioRunId, runIds)),
      ])
    : [[], [], []]

  return rows.map((campaign) => ({
    id: campaign.id,
    seed: campaign.seed,
    target: campaign.target,
    startedAt: campaign.startedAt.toISOString(),
    finishedAt: campaign.finishedAt.toISOString(),
    stoppedEarly: campaign.stoppedEarly,
    merchantLeakCents: campaign.merchantLeakCents,
    customerHarmCents: campaign.customerHarmCents,
    source: campaign.source as CampaignSource,
    switches: campaign.switches as Partial<StoreMode> | null,
    scenarios: runs
      .filter((run) => run.campaignId === campaign.id)
      .map((run) => ({
        persona: run.persona as StoredCampaign['scenarios'][number]['persona'],
        scenario: run.scenario,
        title: run.title,
        position: run.position,
        error: run.error,
        skipped: run.skipped,
        entries: entries
          .filter((entry) => entry.scenarioRunId === run.id)
          .map((entry) => entry.entry as StoredCampaign['scenarios'][number]['entries'][number]),
        checks: checks
          .filter((check) => check.scenarioRunId === run.id)
          .map(({ invariant, title, verdict, detail }) => ({ invariant, title, verdict, detail })),
        findings: found
          .filter((finding) => finding.scenarioRunId === run.id)
          .map((finding) => ({
            id: finding.id,
            invariant: finding.invariant,
            title: finding.title,
            severity: finding.severity,
            merchantLeakCents: finding.merchantLeakCents,
            customerHarmCents: finding.customerHarmCents,
            detail: finding.detail,
            fix: finding.fix,
            evidence: finding.evidence,
            at: finding.at.toISOString(),
          })),
      })),
  }))
}
