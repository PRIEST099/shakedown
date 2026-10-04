import { randomBytes } from 'node:crypto'
import type { PersonaId, RandomStreams, RunEvent, SavedRun } from '@shakedown/core'

export type Switches = 'leaky' | 'sealed'
export type RunnerName = 'in-process' | 'render-workflows'

/**
 * A hosted campaign, as plain data. It crosses into Render Workflows as a task argument, so it
 * carries no secrets and no store address: whatever runs it tests the demo store it was set up
 * with, and nothing else.
 */
export interface CampaignJob {
  id: string
  switches: Switches
  seed: number
  cast: PersonaId[]
  /** Unique per run: the store keys its checkouts, and so its PayPal requests, with it. */
  runNonce: string
  startedAt: string
}

/** One customer's part of a run, as plain data, and where the random streams ended. */
export interface CustomerStep {
  persona: PersonaId
  /** Origin of the store that was tested. */
  target: string
  outcomes: SavedRun['outcomes']
  streams: RandomStreams
  /** Set when the customer's budget ran out. */
  stoppedEarly?: string
}

/** What a job writes to its event log: the engine's own events, framed by the job's. */
export type JobEvent =
  | RunEvent
  | {
      type: 'job:started'
      runner: RunnerName
      switches: Switches
      cast: PersonaId[]
      startedAt: string
    }
  /** A customer's step began. Attempt 2 or more means the step is being retried. */
  | { type: 'job:customer'; persona: PersonaId; attempt: number }
  | { type: 'job:stored'; campaignId: string }
  | { type: 'job:failed'; reason: string }

export function newJob(options: {
  switches: Switches
  cast: readonly PersonaId[]
  seed?: number
  now?: Date
}): CampaignJob {
  const now = options.now ?? new Date()
  return {
    id: `CMP-${randomBytes(6).toString('hex').toUpperCase()}`,
    switches: options.switches,
    seed: options.seed ?? 2026,
    cast: [...options.cast],
    runNonce: now.getTime().toString(36),
    startedAt: now.toISOString(),
  }
}
