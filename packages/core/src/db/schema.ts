import { relations } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
  /** Where the run came from: the console, the CLI, or a recording. */
  source: text('source').notNull().default('live'),
  /** A demo store's switches for this campaign, when a campaign token set them. */
  switches: jsonb('switches').$type<Record<string, 'leaky' | 'sealed'>>(),
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
    /** Why the scenario could not run against this target, when it could not. */
    skipped: text('skipped'),
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
    /** Finding IDs come from the campaign's seed, so they are unique within a campaign only. */
    id: text('id').notNull(),
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
  (table) => [
    primaryKey({ columns: [table.campaignId, table.id] }),
    index('findings_campaign').on(table.campaignId),
  ],
)

/**
 * A campaign someone asked for from the console or the site. The job outlives the request: it
 * runs in this process or on Render Workflows, writes its progress to campaign_events as it
 * goes, and records where the finished campaign was stored.
 */
export const campaignJobs = pgTable(
  'campaign_jobs',
  {
    /** The campaign ID the run uses. It is stored under it, or a free variant of it. */
    id: text('id').primaryKey(),
    /** The demo store's switches for the whole run: 'leaky' or 'sealed'. */
    switches: text('switches').notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    cast: jsonb('cast').$type<string[]>().notNull(),
    /** 'in-process' or 'render-workflows'. */
    runner: text('runner').notNull(),
    /** 'queued', 'running', 'stored' or 'failed'. */
    status: text('status').notNull().default('queued'),
    /** Render Workflows' run ID, when it runs there. */
    taskRunId: text('task_run_id'),
    storedAs: text('stored_as'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('campaign_jobs_status').on(table.status)],
)

/** A job's progress, in order: the engine's events, then how the job ended. Append-only. */
export const campaignEvents = pgTable(
  'campaign_events',
  {
    id: serial('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => campaignJobs.id, { onDelete: 'cascade' }),
    event: jsonb('event').$type<Record<string, unknown> & { type: string }>().notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('campaign_events_job').on(table.jobId, table.id)],
)

/**
 * Paid Claude calls made by a hosted service with no disk of its own, so its spending cap holds
 * across restarts and deploys. Local tools keep the machine-wide file in .data instead.
 */
export const aiSpend = pgTable('ai_spend', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  model: text('model').notNull(),
  purpose: text('purpose').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cacheWriteTokens: integer('cache_write_tokens').notNull(),
  cacheReadTokens: integer('cache_read_tokens').notNull(),
  /** Micro-dollars, so sums are exact. */
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull(),
  requestId: text('request_id'),
})

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
  campaignJobs,
  campaignEvents,
  aiSpend,
}
