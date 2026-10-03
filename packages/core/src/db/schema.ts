import { relations } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * A campaign is stored so a reviewer can reopen it: the seed replays the run, the ledger shows
 * every exchange, and each finding points back at the entries it was graded from.
 */

export const verdictEnum = pgEnum('verdict', ['sealed', 'leak', 'inconclusive'])
export const severityEnum = pgEnum('severity', ['high', 'medium', 'low'])

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  /** Origin of the system under test. Always an integration the operator owns. */
  target: text('target').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  /** Set when the budget ran out or the operator stopped the run. */
  stoppedEarly: text('stopped_early'),
  merchantLeakCents: integer('merchant_leak_cents').notNull().default(0),
  customerHarmCents: integer('customer_harm_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const scenarioRuns = pgTable(
  'scenario_runs',
  {
    id: serial('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    persona: text('persona').notNull(),
    scenario: text('scenario').notNull(),
    title: text('title').notNull(),
    /** The steps, as decided before the run started. */
    plan: jsonb('plan').$type<string[]>().notNull(),
    error: text('error'),
    position: integer('position').notNull(),
  },
  (table) => [
    uniqueIndex('scenario_runs_campaign_position').on(table.campaignId, table.position),
    index('scenario_runs_campaign').on(table.campaignId),
  ],
)

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: serial('id').primaryKey(),
    scenarioRunId: integer('scenario_run_id')
      .notNull()
      .references(() => scenarioRuns.id, { onDelete: 'cascade' }),
    /** Position within the scenario. The ledger is append-only and read in order. */
    position: integer('position').notNull(),
    kind: text('kind').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    entry: jsonb('entry').notNull(),
  },
  (table) => [uniqueIndex('ledger_entries_run_position').on(table.scenarioRunId, table.position)],
)

/** Every invariant that ran, sealed ones included: the green lines are half the report. */
export const invariantResults = pgTable(
  'invariant_results',
  {
    id: serial('id').primaryKey(),
    scenarioRunId: integer('scenario_run_id')
      .notNull()
      .references(() => scenarioRuns.id, { onDelete: 'cascade' }),
    invariant: text('invariant').notNull(),
    title: text('title').notNull(),
    verdict: verdictEnum('verdict').notNull(),
    detail: text('detail').notNull(),
  },
  (table) => [
    uniqueIndex('invariant_results_run_invariant').on(table.scenarioRunId, table.invariant),
  ],
)

export const findings = pgTable(
  'findings',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    scenarioRunId: integer('scenario_run_id')
      .notNull()
      .references(() => scenarioRuns.id, { onDelete: 'cascade' }),
    persona: text('persona').notNull(),
    scenario: text('scenario').notNull(),
    invariant: text('invariant').notNull(),
    title: text('title').notNull(),
    severity: severityEnum('severity').notNull(),
    merchantLeakCents: integer('merchant_leak_cents').notNull().default(0),
    customerHarmCents: integer('customer_harm_cents').notNull().default(0),
    detail: text('detail').notNull(),
    fix: text('fix').notNull(),
    /** Quoted from the ledger, never composed. */
    evidence: jsonb('evidence').$type<Array<{ label: string; value: string }>>().notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (table) => [index('findings_campaign').on(table.campaignId)],
)

export const campaignRelations = relations(campaigns, ({ many }) => ({
  scenarioRuns: many(scenarioRuns),
  findings: many(findings),
}))

export const scenarioRunRelations = relations(scenarioRuns, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [scenarioRuns.campaignId], references: [campaigns.id] }),
  ledgerEntries: many(ledgerEntries),
  invariantResults: many(invariantResults),
  findings: many(findings),
}))

export const ledgerEntryRelations = relations(ledgerEntries, ({ one }) => ({
  scenarioRun: one(scenarioRuns, {
    fields: [ledgerEntries.scenarioRunId],
    references: [scenarioRuns.id],
  }),
}))

export const invariantResultRelations = relations(invariantResults, ({ one }) => ({
  scenarioRun: one(scenarioRuns, {
    fields: [invariantResults.scenarioRunId],
    references: [scenarioRuns.id],
  }),
}))

export const findingRelations = relations(findings, ({ one }) => ({
  campaign: one(campaigns, { fields: [findings.campaignId], references: [campaigns.id] }),
  scenarioRun: one(scenarioRuns, {
    fields: [findings.scenarioRunId],
    references: [scenarioRuns.id],
  }),
}))

export const schema = {
  campaigns,
  scenarioRuns,
  ledgerEntries,
  invariantResults,
  findings,
}
