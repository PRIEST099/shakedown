import type { PersonaId } from '@shakedown/core'
import { campaignEvents, campaignJobs, type Database } from '@shakedown/core/db'
import { and, asc, count, eq, gt, inArray, sql } from 'drizzle-orm'
import type { CampaignJob, JobEvent, RunnerName } from './job'

/** A job older than this with no word from it is taken to be dead, not running. */
export const STALE_AFTER_MS = 15 * 60_000

export function jobStore(db: Database) {
  const touch = (id: string, values: Partial<typeof campaignJobs.$inferInsert>) =>
    db
      .update(campaignJobs)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(campaignJobs.id, id))
      .then(() => undefined)

  return {
    async create(job: CampaignJob, runner: RunnerName): Promise<void> {
      await db.insert(campaignJobs).values({
        id: job.id,
        switches: job.switches,
        seed: job.seed,
        cast: job.cast,
        runner,
        status: 'queued',
      })
    },
    async get(id: string) {
      const [row] = await db.select().from(campaignJobs).where(eq(campaignJobs.id, id)).limit(1)
      return row
    },
    taskRun: (id: string, taskRunId: string) => touch(id, { taskRunId }),
    running: (id: string) => touch(id, { status: 'running' }),
    /** Proof of life between steps, so a long run never looks stale. */
    heartbeat: (id: string) => touch(id, {}),
    stored: (id: string, storedAs: string) => touch(id, { status: 'stored', storedAs }),
    failed: (id: string, error: string) => touch(id, { status: 'failed', error }),
    /** Jobs queued or running now, leaving out any that went quiet too long ago to be alive. */
    async active(now = new Date()): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(campaignJobs)
        .where(
          and(
            inArray(campaignJobs.status, ['queued', 'running']),
            gt(campaignJobs.updatedAt, new Date(now.getTime() - STALE_AFTER_MS)),
          ),
        )
      return row?.n ?? 0
    },
    /** Jobs started since a moment, whatever became of them. */
    async createdSince(since: Date): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(campaignJobs)
        .where(gt(campaignJobs.createdAt, since))
      return row?.n ?? 0
    },
  }
}

export type JobStore = ReturnType<typeof jobStore>

/** A job's progress, append-only. Whoever runs the job writes it; the console reads it. */
export function eventLog(db: Database) {
  return {
    async append(jobId: string, event: JobEvent): Promise<void> {
      await db.insert(campaignEvents).values({ jobId, event })
    },
    async since(
      jobId: string,
      afterId = 0,
      limit = 500,
    ): Promise<{ id: number; event: JobEvent }[]> {
      const rows = await db
        .select({ id: campaignEvents.id, event: campaignEvents.event })
        .from(campaignEvents)
        .where(and(eq(campaignEvents.jobId, jobId), gt(campaignEvents.id, afterId)))
        .orderBy(asc(campaignEvents.id))
        .limit(limit)
      return rows as { id: number; event: JobEvent }[]
    },
    /** How many times a customer's step has started in this job. */
    async attempts(jobId: string, persona: PersonaId): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(campaignEvents)
        .where(
          and(
            eq(campaignEvents.jobId, jobId),
            sql`${campaignEvents.event}->>'type' = 'job:customer'`,
            sql`${campaignEvents.event}->>'persona' = ${persona}`,
          ),
        )
      return row?.n ?? 0
    },
  }
}

export type EventLog = ReturnType<typeof eventLog>
