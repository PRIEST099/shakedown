import type { PersonaId } from '@shakedown/core'
import { type JobDeps, runJob } from './campaign'
import { type CustomerDeps, runCustomer } from './customer'
import { type CampaignJob, newJob, type RunnerName, type Switches } from './job'
import type { EventLog, JobStore } from './store'

/** Starts a job somewhere and returns without waiting for it. Progress goes to the event log. */
export interface CampaignRunner {
  readonly name: RunnerName
  start(job: CampaignJob): Promise<void>
}

/** Runs jobs inside this process: local development, and wherever Render Workflows isn't set up. */
export function inProcessRunner(
  deps: Omit<JobDeps, 'runStep'> & { customer: CustomerDeps },
): CampaignRunner {
  return {
    name: 'in-process',
    async start(job) {
      // Not awaited: the caller answers at once and follows the log. A failure is in the log too.
      void runJob(job, {
        ...deps,
        runStep: (j, persona, resume) => runCustomer(j, persona, resume, deps.customer),
      }).catch(() => {})
    },
  }
}

/** The one Render SDK call the runner makes. `new Render().workflows` provides it. */
export interface TaskStarter {
  startTask(
    slug: string,
    input: unknown[],
    options?: { idempotencyKey?: string },
  ): Promise<{ taskRunId: string }>
}

/**
 * Runs jobs on Render Workflows: the `campaign` task runs each customer as its own `customer`
 * task, on its own compute, retried on its own. The job ID doubles as the idempotency key, so a
 * retried request never starts a second run.
 */
export function renderWorkflowsRunner(options: {
  workflows: TaskStarter
  /** The workflow service's slug, e.g. `shakedown-runs`. */
  workflow: string
  jobs: Pick<JobStore, 'taskRun'>
}): CampaignRunner {
  return {
    name: 'render-workflows',
    async start(job) {
      const run = await options.workflows.startTask(`${options.workflow}/campaign`, [job], {
        idempotencyKey: job.id,
      })
      await options.jobs.taskRun(job.id, run.taskRunId)
    },
  }
}

export class BusyError extends Error {
  constructor(
    message: string,
    readonly status: 429 | 503,
  ) {
    super(message)
    this.name = 'BusyError'
  }
}

export interface Limits {
  /** Jobs queued or running at once, across everyone. */
  maxActive: number
  /** Jobs started in any 24 hours, across everyone. */
  maxPerDay: number
}

/**
 * Open a job and hand it to a runner, within the limits. The log says it started before the
 * runner is asked, so whoever follows the job sees it at once.
 */
export async function dispatch(
  request: { switches: Switches; cast: readonly PersonaId[]; seed?: number },
  deps: {
    runner: CampaignRunner
    jobs: Pick<JobStore, 'create' | 'active' | 'createdSince' | 'failed'>
    events: Pick<EventLog, 'append'>
    limits: Limits
    now?: () => Date
  },
): Promise<CampaignJob> {
  const now = deps.now?.() ?? new Date()
  if ((await deps.jobs.active(now)) >= deps.limits.maxActive) {
    throw new BusyError('The cast is busy with other runs. Try again in a minute.', 503)
  }
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000)
  if ((await deps.jobs.createdSince(dayAgo)) >= deps.limits.maxPerDay) {
    throw new BusyError("Today's runs are used up. Watch the recorded run instead.", 429)
  }
  const job = newJob({ ...request, now })
  await deps.jobs.create(job, deps.runner.name)
  await deps.events.append(job.id, {
    type: 'job:started',
    runner: deps.runner.name,
    switches: job.switches,
    cast: job.cast,
    startedAt: job.startedAt,
  })
  try {
    await deps.runner.start(job)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await deps.jobs.failed(job.id, reason)
    await deps.events.append(job.id, { type: 'job:failed', reason })
    throw error
  }
  return job
}
