import {
  PERSONA_MODULES,
  type PersonaId,
  type PersonaModule,
  type RandomStreams,
  regrade,
  type SavedRun,
} from '@shakedown/core'
import { type Database, storeCampaign } from '@shakedown/core/db'
import { RunSetupError, storeMode } from './customer'
import type { CampaignJob, CustomerStep } from './job'
import type { EventLog, JobStore } from './store'

export interface JobDeps {
  db: Database
  jobs: Pick<JobStore, 'running' | 'stored' | 'failed'>
  events: Pick<EventLog, 'append'>
  /** One customer's step: in this process, or as its own Render Workflows task run. */
  runStep(
    job: CampaignJob,
    persona: PersonaId,
    resume: RandomStreams | undefined,
  ): Promise<CustomerStep>
  modules?: Partial<Record<PersonaId, PersonaModule>>
  now?: () => Date
}

/**
 * Runs a job's customers one after another, each carrying on the random streams of the one
 * before, then grades and stores the whole campaign. The steps can run anywhere; the result is
 * the same as one run of the cast with the same seed.
 */
export async function runJob(job: CampaignJob, deps: JobDeps): Promise<string> {
  try {
    await deps.jobs.running(job.id)
    const steps: CustomerStep[] = []
    let resume: RandomStreams | undefined
    for (const persona of job.cast) {
      const step = await deps.runStep(job, persona, resume)
      steps.push(step)
      resume = step.streams
    }
    return await finishJob(job, steps, deps)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    // The log is shown to visitors, so it gets words fit for them. The job keeps the detail.
    const reason =
      error instanceof RunSetupError
        ? error.message
        : 'The run stopped unexpectedly. Watch the recorded run instead.'
    console.error(`[runs] job ${job.id} failed: ${detail}`)
    await deps.jobs.failed(job.id, detail).catch(() => {})
    await deps.events.append(job.id, { type: 'job:failed', reason }).catch(() => {})
    throw error
  }
}

/** Grade the whole ledger at once, as a single run would be graded, then store it. */
export async function finishJob(
  job: CampaignJob,
  steps: readonly CustomerStep[],
  deps: Pick<JobDeps, 'db' | 'jobs' | 'events' | 'modules' | 'now'>,
): Promise<string> {
  const saved: SavedRun = {
    version: 1,
    campaignId: job.id,
    seed: job.seed,
    target: steps[0]?.target ?? '',
    startedAt: job.startedAt,
    finishedAt: (deps.now?.() ?? new Date()).toISOString(),
    outcomes: steps.flatMap((step) => step.outcomes),
  }
  const result = regrade(saved, deps.modules ?? PERSONA_MODULES)
  const stoppedEarly = steps.find((step) => step.stoppedEarly)?.stoppedEarly
  if (stoppedEarly) result.stoppedEarly = stoppedEarly
  const storedAs = await storeCampaign(deps.db, result, {
    source: 'live',
    switches: storeMode(job.switches),
  })
  await deps.jobs.stored(job.id, storedAs)
  await deps.events.append(job.id, { type: 'job:stored', campaignId: storedAs })
  return storedAs
}
