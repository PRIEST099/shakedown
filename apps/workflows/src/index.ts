import { type TaskContext, task } from '@renderinc/sdk/workflows'
import type { PersonaId, RandomStreams } from '@shakedown/core'
import { createDb, type Database } from '@shakedown/core/db'
import {
  type CampaignJob,
  type CustomerStep,
  eventLog,
  jobStore,
  runCustomer,
  runEnvironment,
  runJob,
} from '@shakedown/runs'

/**
 * Shakedown's Render Workflows service. A campaign is one task run; each customer in it is a
 * task run of its own, on its own compute, retried on its own if it fails. The customers go one
 * after another, each picking up the random streams where the last one left them, so a run here
 * is the same run the CLI makes with the same seed. Progress and results go to the console's
 * Postgres, where the web app reads them.
 */

let database: Database | undefined
function db(): Database {
  if (!database) {
    const url = process.env.CONSOLE_DATABASE_URL?.trim()
    if (!url) throw new Error('CONSOLE_DATABASE_URL is not set, so there is nowhere to write.')
    database = createDb(url, { max: 2 }).db
  }
  return database
}

export const customer = task(
  {
    name: 'customer',
    // One more go if the step dies: it replays the same draws with a fresh nonce.
    retry: { maxRetries: 1, waitDurationMs: 3_000, backoffScaling: 2 },
    timeoutSeconds: 300,
  },
  async function customer(
    _ctx: TaskContext,
    job: CampaignJob,
    persona: PersonaId,
    resume: RandomStreams | null,
  ): Promise<CustomerStep> {
    return runCustomer(job, persona, resume ?? undefined, {
      env: runEnvironment(),
      events: eventLog(db()),
      jobs: jobStore(db()),
    })
  },
)

export const campaign = task(
  { name: 'campaign', timeoutSeconds: 900 },
  async function campaign(ctx: TaskContext, job: CampaignJob): Promise<string> {
    return runJob(job, {
      db: db(),
      jobs: jobStore(db()),
      events: eventLog(db()),
      // Task arguments travel as JSON, where a missing value has to be null.
      runStep: (j, persona, resume) => ctx.run(customer, j, persona, resume ?? null),
    })
  },
)
