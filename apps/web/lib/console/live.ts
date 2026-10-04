import { Render } from '@renderinc/sdk'
import { PERSONA_MODULES, type PersonaId, type StoreMode } from '@shakedown/core'
import {
  BusyError,
  type CampaignRunner,
  dispatch,
  eventLog,
  inProcessRunner,
  type JobEvent,
  jobStore,
  type Limits,
  RunSetupError,
  renderWorkflowsRunner,
  runEnvironment,
  STALE_AFTER_MS,
  storeMode,
} from '@shakedown/runs'
import { LIVE_CAST } from './labels'
import { describeSwitches, type FindingRow, findingRow } from './rows'
import { getConsoleDb } from './store'

/**
 * Live campaigns from the console and the site. They run against Shakedown's own demo store
 * (never anyone else's), with only the customers that need no AI, so a click costs nothing but
 * sandbox calls. A run is a job: it runs on Render Workflows when that is set up, in this
 * process otherwise, and either way writes its progress to the campaign store, which is where
 * the console's stream reads it from.
 */

export { LIVE_CAST }

/** What a console stream carries, in the console's terms: progress, each leak as a row, the end. */
export type LiveEvent =
  | { type: 'started'; campaignId: string; switches: string; mode: StoreMode; startedAt: string }
  | {
      type: 'scenario'
      persona: PersonaId
      title: string
      state: 'running' | 'done' | 'skipped'
      leaks?: number
      reason?: string
    }
  | { type: 'leak'; row: FindingRow }
  /** A customer's step is being run again: drop what it printed so far. */
  | { type: 'retry'; campaignId: string; persona: PersonaId }
  | { type: 'stored'; campaignId: string }
  | { type: 'failed'; reason: string }

const titleOf = (persona: PersonaId, scenario: string) =>
  PERSONA_MODULES[persona]?.scenarios.find((s) => s.id === scenario)?.title ?? scenario

export interface LiveContext {
  campaignId: string
  /** The scenario each customer is on, so a finished one can be named. */
  current?: Partial<Record<PersonaId, string>>
}

/** A job's events, translated for the console. */
export function toLiveEvents(event: JobEvent, context: LiveContext): LiveEvent[] {
  context.current ??= {}
  switch (event.type) {
    case 'job:started': {
      const mode = storeMode(event.switches)
      return [
        {
          type: 'started',
          campaignId: context.campaignId,
          switches: describeSwitches(mode),
          mode,
          startedAt: event.startedAt,
        },
      ]
    }
    case 'job:customer':
      return event.attempt > 1
        ? [{ type: 'retry', campaignId: context.campaignId, persona: event.persona }]
        : []
    case 'scenario:started':
      context.current[event.persona] = event.scenario
      return [
        {
          type: 'scenario',
          persona: event.persona,
          title: titleOf(event.persona, event.scenario),
          state: 'running',
        },
      ]
    case 'scenario:skipped':
      return [
        {
          type: 'scenario',
          persona: event.persona,
          title: titleOf(event.persona, event.scenario),
          state: 'skipped',
          reason: event.reason,
        },
      ]
    case 'scenario:finished': {
      const scenario = context.current[event.persona]
      return [
        {
          type: 'scenario',
          persona: event.persona,
          title: scenario ? titleOf(event.persona, scenario) : '',
          state: 'done',
          leaks: event.findings,
        },
      ]
    }
    case 'finding':
      return [
        {
          type: 'leak',
          row: findingRow(
            context.campaignId,
            event.finding.persona,
            titleOf(event.finding.persona, event.finding.scenario),
            event.finding,
          ),
        },
      ]
    case 'job:stored':
      return [{ type: 'stored', campaignId: event.campaignId }]
    case 'job:failed':
      return [{ type: 'failed', reason: event.reason }]
    default:
      return []
  }
}

/** Why a run didn't start, in words fit for anyone visiting the site. */
export class LiveCampaignError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'busy' | 'limit' | 'unavailable',
  ) {
    super(message)
    this.name = 'LiveCampaignError'
  }
}

/** Hosted for judges: more people at once, so a few runs side by side and a daily ceiling. */
export const judgeMode = () => process.env.SHAKEDOWN_JUDGE_MODE === '1'

export const runLimits = (): Limits =>
  judgeMode() ? { maxActive: 3, maxPerDay: 200 } : { maxActive: 1, maxPerDay: 1000 }

/** Where live runs go: Render Workflows when its service and an API key are set, else here. */
export async function liveRunner(): Promise<CampaignRunner> {
  const db = await getConsoleDb()
  const workflow = process.env.SHAKEDOWN_WORKFLOW?.trim()
  if (workflow && process.env.RENDER_API_KEY?.trim()) {
    return renderWorkflowsRunner({
      workflows: new Render().workflows,
      workflow,
      jobs: jobStore(db),
    })
  }
  return inProcessRunner({
    db,
    jobs: jobStore(db),
    events: eventLog(db),
    customer: { env: runEnvironment(), events: eventLog(db), jobs: jobStore(db) },
  })
}

/** Start a live run against the demo store, with every switch one way. Returns the job's ID. */
export async function startLiveRun(switches: 'leaky' | 'sealed'): Promise<string> {
  try {
    const db = await getConsoleDb()
    const job = await dispatch(
      { switches, cast: LIVE_CAST },
      { runner: await liveRunner(), jobs: jobStore(db), events: eventLog(db), limits: runLimits() },
    )
    return job.id
  } catch (error) {
    if (error instanceof BusyError) {
      throw new LiveCampaignError(
        error.message,
        error.status,
        error.status === 503 ? 'busy' : 'limit',
      )
    }
    // The details stay in the server log: they can name internal addresses.
    console.error('[live] a run could not start:', error instanceof Error ? error.message : error)
    throw new LiveCampaignError(
      error instanceof RunSetupError
        ? 'Live runs aren’t set up here. Watch the recorded run instead.'
        : 'Live runs aren’t available right now. Watch the recorded run instead.',
      503,
      'unavailable',
    )
  }
}

/**
 * Follow a job: everything so far, then each event as it lands, until it ends. Reads the log
 * every half second, so it works the same whether the job runs here or on Render Workflows.
 */
export async function followRun(
  jobId: string,
  send: (event: LiveEvent) => void,
  signal: AbortSignal,
  options: { intervalMs?: number; quietLimitMs?: number } = {},
): Promise<void> {
  const log = eventLog(await getConsoleDb())
  const context: LiveContext = { campaignId: jobId }
  let after = 0
  let heardAt = Date.now()
  while (!signal.aborted) {
    const rows = await log.since(jobId, after)
    for (const { id, event } of rows) {
      after = id
      heardAt = Date.now()
      for (const live of toLiveEvents(event, context)) {
        send(live)
        if (live.type === 'stored' || live.type === 'failed') return
      }
    }
    if (Date.now() - heardAt > (options.quietLimitMs ?? STALE_AFTER_MS)) {
      send({ type: 'failed', reason: 'The run stopped answering. Watch the recorded run instead.' })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 500))
  }
}

export async function jobExists(jobId: string): Promise<boolean> {
  return Boolean(await jobStore(await getConsoleDb()).get(jobId))
}
