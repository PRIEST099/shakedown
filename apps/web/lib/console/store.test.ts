import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { CAST, type LedgerEntry, regrade, type SavedRun } from '@shakedown/core'
import { type Database, schema } from '@shakedown/core/db'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import { consoleTables, describeEntry, describeSwitches, type StoredCampaign } from './rows'
import { loadCampaigns, seedRecordedRuns, storeCampaign } from './store'
import { leakSummary } from './summary'

const RECORDED = path.resolve(import.meta.dirname, '../../fixtures/recorded')
const recorded = readdirSync(RECORDED)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(path.join(RECORDED, name), 'utf8')) as { run: SavedRun })

let db: Database
let stored: StoredCampaign[]

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema })
  await migrate(pg, {
    migrationsFolder: path.resolve(import.meta.dirname, '../../../../packages/core/drizzle'),
  })
  db = pg as unknown as Database
  expect(await seedRecordedRuns(db, RECORDED)).toBe(recorded.length)
  stored = await loadCampaigns(db)
})

describe('the console store', () => {
  it('seeds an empty store with every recorded run, once', async () => {
    expect(stored).toHaveLength(recorded.length)
    expect(await seedRecordedRuns(db, RECORDED)).toBe(0)
  })

  it('keeps two runs with the same seed apart', () => {
    const ids = stored.map((campaign) => campaign.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('CMP-74A923AC4019-2')
  })

  it('reads back exactly what the graders decided', () => {
    for (const { run } of recorded) {
      const graded = regrade(run)
      const back = stored.find(
        (campaign) => campaign.startedAt === new Date(run.startedAt).toISOString(),
      )
      expect(back?.merchantLeakCents).toBe(graded.merchantLeakCents)
      expect(back?.customerHarmCents).toBe(graded.customerHarmCents)
      expect(back?.scenarios.flatMap((s) => s.findings)).toHaveLength(graded.findings.length)
      expect(back?.scenarios.flatMap((s) => s.entries)).toHaveLength(
        graded.outcomes.reduce((sum, outcome) => sum + outcome.entries.length, 0),
      )
    }
  })

  it('stores a re-run under a fresh ID, findings and all', async () => {
    const again = regrade(recorded[0]?.run as SavedRun)
    const id = await storeCampaign(db, again, { source: 'cli' })
    expect(id).toBe('CMP-74A923AC4019-3')
    const [latest] = (await loadCampaigns(db)).filter((campaign) => campaign.id === id)
    expect(latest?.scenarios.flatMap((s) => s.findings)).toHaveLength(again.findings.length)
  })
})

describe('the console tables', () => {
  it('adds up to the stored campaigns', () => {
    const tables = consoleTables(stored)
    for (const campaign of stored) {
      const row = tables.campaigns.find((c) => c.campaign_id === campaign.id)
      const findings = tables.findings.filter((f) => f.campaign_id === campaign.id)
      expect(row?.merchant_leak_usd).toBeCloseTo(campaign.merchantLeakCents / 100)
      expect(row?.leaks).toBe(findings.length)
      expect(findings.reduce((sum, f) => sum + f.merchant_leak_usd, 0)).toBeCloseTo(
        campaign.merchantLeakCents / 100,
      )
      expect(row?.verdict).toBe(findings.length ? 'LEAK' : 'SEALED')
    }
    expect(tables.cast.map((c) => c.persona_id)).toEqual(
      CAST.filter((p) => p.id !== 'second-opinion').map((p) => p.id),
    )
  })

  it('links every leaking check to its finding', () => {
    const tables = consoleTables(stored)
    const leaks = tables.checks.filter((check) => check.verdict === 'Leak')
    expect(leaks.length).toBeGreaterThan(0)
    for (const check of leaks) {
      expect(tables.findings.some((f) => f.finding_key === check.finding_key)).toBe(true)
    }
  })

  it('marks the ledger entries a finding quotes as evidence', () => {
    const tables = consoleTables(stored)
    const cited = tables.ledger.filter((entry) => entry.cited)
    expect(cited.length).toBeGreaterThan(0)
    for (const entry of cited) {
      const finding = tables.findings.filter((f) => f.campaign_id === entry.campaign_id)
      expect(finding.some((f) => f.evidence.includes(entry.paypal_id ?? '¤'))).toBe(true)
    }
  })

  it('describes every ledger entry in plain words', () => {
    const entries = stored.flatMap((c) => c.scenarios.flatMap((s) => s.entries)) as LedgerEntry[]
    const kinds = new Set(entries.map((entry) => entry.kind))
    expect(kinds.size).toBeGreaterThan(6)
    for (const entry of entries) expect(describeEntry(entry).summary.length).toBeGreaterThan(8)
  })

  it('names the switches a run used', () => {
    expect(describeSwitches(null)).toBe('as shipped')
    expect(describeSwitches({ echo: 'leaky', bouncer: 'leaky' })).toBe('all leaky')
    expect(describeSwitches({ echo: 'sealed', bouncer: 'leaky' })).toBe('1 sealed')
  })
})

describe("Triage's leak summary", () => {
  it('ranks customers by money at risk, computed from the graded checks', () => {
    const tables = consoleTables(stored)
    const summary = leakSummary(tables, 10)
    expect(summary.runsCounted).toBe(stored.length)
    const total = summary.byCustomer.reduce((sum, row) => sum + row.atRiskUsd, 0)
    const expected = stored.reduce((sum, c) => sum + c.merchantLeakCents + c.customerHarmCents, 0)
    expect(total).toBeCloseTo(expected / 100)
    expect(summary.mostAtRisk).toBe(summary.byCustomer[0]?.customer)
    expect(summary.worstLeaks.length).toBeGreaterThan(0)
    expect(summary.worstLeaks[0]?.fix.length).toBeGreaterThan(10)
  })

  it('counts only the runs asked for, newest first', () => {
    const summary = leakSummary(consoleTables(stored), 1)
    expect(summary.runsCounted).toBe(1)
    expect(summary.runs[0]?.run).toBe(
      consoleTables(stored).campaigns.sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
        ?.run_label,
    )
  })
})
