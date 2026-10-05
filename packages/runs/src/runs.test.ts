import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import {
  type Invariant,
  type PersonaModule,
  type RandomStreams,
  runCampaign,
  type Scenario,
} from '@shakedown/core'
import { campaignJobs, campaigns, type Database, findings, schema } from '@shakedown/core/db'
import { type FixtureTarget, LEAKY, startFixtureTarget } from '@shakedown/core/testing'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runJob } from './campaign'
import { type CustomerDeps, runCustomer, storePolicy, storeUrl } from './customer'
import { type CampaignJob, newJob } from './job'
import { BusyError, type CampaignRunner, dispatch, renderWorkflowsRunner } from './runners'
import { eventLog, jobStore, STALE_AFTER_MS } from './store'

let fixture: FixtureTarget
let db: Database

beforeAll(async () => {
  fixture = await startFixtureTarget({ flags: LEAKY })
  const pg = drizzle(new PGlite(), { schema })
  await migrate(pg, { migrationsFolder: path.resolve(import.meta.dirname, '../../core/drizzle') })
  db = pg as unknown as Database
})

afterAll(async () => {
  await fixture.close()
})

const nonces: string[] = []
const leaks = (persona: 'echo' | 'bouncer'): Invariant => ({
  id: `${persona}.always-leaks`,
  persona,
  title: 'Always leaks',
  severity: 'high',
  fix: 'x',
  evaluate: () => ({ verdict: 'leak', detail: 'x', merchantLeakCents: 250 }),
})
/** A customer that draws from the random stream and notes what it drew. */
const drawing = (persona: 'echo' | 'bouncer'): PersonaModule => ({
  id: persona,
  scenarios: [
    {
      id: `${persona}-draws`,
      persona,
      title: `${persona} draws`,
      plan: ['draw'],
      act: async (context) => {
        nonces.push(context.runNonce)
        context.step(`${context.rng.id('A')} ${context.rng.int(1000)}`)
      },
      invariants: [leaks(persona)],
    } satisfies Scenario,
  ],
})
const modules = { echo: drawing('echo'), bouncer: drawing('bouncer') }

const customerDeps = (): CustomerDeps => ({
  env: { storeUrl: fixture.adapter.origin, probeSecret: 'a-test-secret-of-16+' },
  events: eventLog(db),
  jobs: jobStore(db),
  target: async () => fixture.adapter,
  paypal: () => undefined,
  modules,
})

const notes = (entries: readonly { kind: string }[]) =>
  entries.map((entry) => ('detail' in entry ? String(entry.detail) : entry.kind))

describe('a hosted run', () => {
  it('runs one customer at a time and stores what one run of the cast would have', async () => {
    const job = newJob({ switches: 'leaky', cast: ['echo', 'bouncer'], seed: 21 })
    await jobStore(db).create(job, 'in-process')
    const storedAs = await runJob(job, {
      db,
      jobs: jobStore(db),
      events: eventLog(db),
      modules,
      runStep: (j, persona, resume) => runCustomer(j, persona, resume, customerDeps()),
    })
    expect(storedAs).toBe(job.id)

    const whole = await runCampaign({
      target: fixture.adapter,
      cast: ['echo', 'bouncer'],
      seed: 21,
      campaignId: job.id,
      modules,
    })
    const stored = await db.select().from(findings).where(eq(findings.campaignId, job.id))
    expect(stored.map((f) => f.id).sort()).toEqual(whole.findings.map((f) => f.id).sort())
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, job.id))
    expect(campaign?.merchantLeakCents).toBe(500)
    expect(campaign?.source).toBe('live')

    const log = await eventLog(db).since(job.id)
    expect(log.map(({ event }) => event.type)).toEqual([
      'job:customer',
      'scenario:started',
      'scenario:step',
      'finding',
      'scenario:finished',
      'job:customer',
      'scenario:started',
      'scenario:step',
      'finding',
      'scenario:finished',
      'job:stored',
    ])
    expect((await jobStore(db).get(job.id))?.status).toBe('stored')
  })

  it('gives a retried customer a nonce of its own, and the same draws', async () => {
    const job = newJob({ switches: 'leaky', cast: ['echo'], seed: 4 })
    await jobStore(db).create(job, 'render-workflows')
    nonces.length = 0
    const first = await runCustomer(job, 'echo', undefined, customerDeps())
    const again = await runCustomer(job, 'echo', undefined, customerDeps())
    expect(nonces).toEqual([job.runNonce, `${job.runNonce}-2`])
    expect(notes(again.outcomes[0]?.entries ?? []).filter((n) => n.startsWith('A-'))).toEqual(
      notes(first.outcomes[0]?.entries ?? []).filter((n) => n.startsWith('A-')),
    )
    const attempts = (await eventLog(db).since(job.id))
      .map(({ event }) => event)
      .filter((event) => event.type === 'job:customer')
    expect(attempts).toEqual([
      { type: 'job:customer', persona: 'echo', attempt: 1 },
      { type: 'job:customer', persona: 'echo', attempt: 2 },
    ])
  })

  it('records a failure in the job and its log', async () => {
    const job = newJob({ switches: 'sealed', cast: ['echo'] })
    await jobStore(db).create(job, 'in-process')
    await expect(
      runJob(job, {
        db,
        jobs: jobStore(db),
        events: eventLog(db),
        runStep: async () => {
          throw new Error('The demo store is not answering.')
        },
      }),
    ).rejects.toThrow('not answering')
    expect(await jobStore(db).get(job.id)).toMatchObject({
      status: 'failed',
      error: 'The demo store is not answering.',
    })
    // Visitors read the log, so an unexpected failure is described in plain words.
    expect((await eventLog(db).since(job.id)).at(-1)?.event).toEqual({
      type: 'job:failed',
      reason: 'The run stopped unexpectedly. Watch the recorded run instead.',
    })
  })
})

describe('starting runs', () => {
  const started: CampaignJob[] = []
  const runner: CampaignRunner = {
    name: 'in-process',
    start: async (job) => {
      started.push(job)
    },
  }

  it('opens the job and its log before the runner starts, within the limits', async () => {
    const fresh = drizzle(new PGlite(), { schema })
    await migrate(fresh, {
      migrationsFolder: path.resolve(import.meta.dirname, '../../core/drizzle'),
    })
    const own = fresh as unknown as Database
    const deps = {
      runner,
      jobs: jobStore(own),
      events: eventLog(own),
      limits: { maxActive: 2, maxPerDay: 3 },
    }
    const job = await dispatch({ switches: 'leaky', cast: ['echo'] }, deps)
    expect(started.at(-1)?.id).toBe(job.id)
    expect((await eventLog(own).since(job.id))[0]?.event).toMatchObject({
      type: 'job:started',
      runner: 'in-process',
      switches: 'leaky',
    })

    await dispatch({ switches: 'leaky', cast: ['echo'] }, deps)
    await expect(dispatch({ switches: 'leaky', cast: ['echo'] }, deps)).rejects.toMatchObject({
      status: 503,
    })

    // A job nobody has heard from for too long no longer holds a place.
    await own
      .update(campaignJobs)
      .set({ updatedAt: new Date(Date.now() - STALE_AFTER_MS - 1000) })
      .where(eq(campaignJobs.id, job.id))
    await dispatch({ switches: 'sealed', cast: ['echo'] }, deps)

    const error = await dispatch({ switches: 'leaky', cast: ['echo'] }, deps).catch((e) => e)
    expect(error).toBeInstanceOf(BusyError)
    expect(error.status).toBe(503)
  })

  it('marks the job failed when the runner cannot start it', async () => {
    const failing: CampaignRunner = {
      name: 'render-workflows',
      start: async () => {
        throw new Error('Render answered 401.')
      },
    }
    const deps = {
      runner: failing,
      jobs: jobStore(db),
      events: eventLog(db),
      limits: { maxActive: 100, maxPerDay: 1000 },
    }
    await expect(dispatch({ switches: 'leaky', cast: ['echo'] }, deps)).rejects.toThrow('401')
    const [failed] = await db
      .select()
      .from(campaignJobs)
      .where(eq(campaignJobs.error, 'Render answered 401.'))
    expect(failed?.status).toBe('failed')
  })

  it('asks Render Workflows for one campaign run per job, and remembers its run ID', async () => {
    const calls: unknown[][] = []
    const job = newJob({ switches: 'leaky', cast: ['echo', 'bouncer'] })
    await jobStore(db).create(job, 'render-workflows')
    const render = renderWorkflowsRunner({
      workflow: 'shakedown-runs',
      jobs: jobStore(db),
      workflows: {
        startTask: async (...args) => {
          calls.push(args)
          return { taskRunId: 'trn-test-1' }
        },
      },
    })
    await render.start(job)
    expect(calls).toEqual([['shakedown-runs/campaign', [job], { idempotencyKey: job.id }]])
    expect((await jobStore(db).get(job.id))?.taskRunId).toBe('trn-test-1')
  })
})

describe('the demo store’s address', () => {
  it('prefers an explicit URL, then the private network, then the local default', () => {
    expect(storeUrl({ LEAKY_LLAMA_URL: 'https://store.test', LEAKY_LLAMA_HOSTPORT: 'x:1' })).toBe(
      'https://store.test',
    )
    expect(storeUrl({ LEAKY_LLAMA_HOSTPORT: 'shakedown-store-ab12:10000' })).toBe(
      'http://shakedown-store-ab12:10000',
    )
    expect(storeUrl({})).toBe('http://localhost:3100')
  })
})

describe('the job argument', () => {
  it('survives the trip through JSON, as a task argument must', () => {
    const job = newJob({ switches: 'sealed', cast: ['double-clicker', 'echo'], seed: 9 })
    expect(JSON.parse(JSON.stringify(job))).toEqual(job)
    const streams: RandomStreams = { rng: 1, findings: 2 }
    expect(JSON.parse(JSON.stringify(streams))).toEqual(streams)
    expect(job.id).toMatch(/^CMP-[0-9A-F]{12}$/)
  })
})

describe('which store a hosted runner may test', () => {
  it('allow-lists only the store its own environment names, and only with the shared token', () => {
    // On Render the store is reached by its private-network name, which isn't an IP or localhost.
    const env = {
      storeUrl: 'http://shakedown-store:10000',
      verificationToken: 'a-token-of-16-chars',
    }
    expect(storePolicy(env)).toEqual({
      allowHosts: ['shakedown-store'],
      verificationToken: 'a-token-of-16-chars',
    })
    // Without the token there's nothing to prove ownership with: no host is allow-listed.
    expect(storePolicy({ storeUrl: env.storeUrl })).toBeUndefined()
  })
})
