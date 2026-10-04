import {
  allLeaky,
  allSealed,
  EventBus,
  httpStoreTarget,
  loadEnv,
  type PayPalSide,
  type PersonaId,
  type PersonaModule,
  type RandomStreams,
  runCampaign,
  type StoreMode,
  sandboxPayPalSide,
  saveRun,
  signCampaignToken,
  type TargetAdapter,
} from '@shakedown/core'
import { PayPalSandboxClient } from '@shakedown/paypal'
import type { CampaignJob, CustomerStep, Switches } from './job'
import type { EventLog, JobStore } from './store'

/**
 * What a run needs from the service running it, read from that service's own environment. A job
 * never names the store: a hosted runner only ever tests the demo store it was deployed with.
 */
export interface RunEnvironment {
  storeUrl: string
  /** Shared with the store: it signs the campaign token and opens the store's probe API. */
  probeSecret: string
  paypal?: { clientId: string; clientSecret: string }
}

export class RunSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunSetupError'
  }
}

/**
 * The demo store's address: LEAKY_LLAMA_URL when set; on Render, the store's host and port on
 * the private network (LEAKY_LLAMA_HOSTPORT), so the probe secret never crosses the internet.
 */
export function storeUrl(source: Record<string, string | undefined> = process.env): string {
  const url = source.LEAKY_LLAMA_URL?.trim()
  if (url) return url
  const hostport = source.LEAKY_LLAMA_HOSTPORT?.trim()
  return hostport ? `http://${hostport}` : 'http://localhost:3100'
}

export function runEnvironment(source: Record<string, string | undefined> = process.env) {
  const env = loadEnv(source)
  if (!env.SHAKEDOWN_PROBE_SECRET) {
    throw new RunSetupError('SHAKEDOWN_PROBE_SECRET is not set, so the store cannot be read.')
  }
  return {
    storeUrl: storeUrl(source),
    probeSecret: env.SHAKEDOWN_PROBE_SECRET,
    paypal:
      env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET
        ? { clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET }
        : undefined,
  } satisfies RunEnvironment
}

export const storeMode = (switches: Switches): StoreMode =>
  switches === 'sealed' ? allSealed() : allLeaky()

/** The demo store, with a campaign token that sets its switches for this run only. */
async function demoStore(job: CampaignJob, env: RunEnvironment): Promise<TargetAdapter> {
  const token = await signCampaignToken(
    { campaignId: job.id, exp: Date.now() + 20 * 60_000, mode: storeMode(job.switches) },
    env.probeSecret,
  )
  return httpStoreTarget({
    baseUrl: env.storeUrl,
    probeSecret: env.probeSecret,
    campaignToken: token,
  }).catch((error: Error) => {
    // The address stays in the server log: on Render it names a host on the private network.
    console.error(`[runs] the demo store at ${env.storeUrl} is not answering: ${error.message}`)
    throw new RunSetupError('The demo store is not answering. Watch the recorded run instead.')
  })
}

export interface CustomerDeps {
  env: RunEnvironment
  events: Pick<EventLog, 'append' | 'attempts'>
  jobs?: Pick<JobStore, 'heartbeat'>
  /** Tests swap in a fixture store, a fake PayPal and their own personas. */
  target?: (job: CampaignJob, env: RunEnvironment) => Promise<TargetAdapter>
  paypal?: () => PayPalSide | undefined
  modules?: Partial<Record<PersonaId, PersonaModule>>
}

/**
 * One customer's visit, picking up the random streams where the previous customer left them, so
 * a run made of steps draws exactly what one run of the whole cast would. Its events go to the
 * job's log as they happen, in order.
 */
export async function runCustomer(
  job: CampaignJob,
  persona: PersonaId,
  resume: RandomStreams | undefined,
  deps: CustomerDeps,
): Promise<CustomerStep> {
  const attempt = (await deps.events.attempts(job.id, persona)) + 1
  await deps.events.append(job.id, { type: 'job:customer', persona, attempt })
  await deps.jobs?.heartbeat(job.id)
  // A retried step must not look like the same checkout to the store, so it gets its own nonce.
  const runNonce = attempt === 1 ? job.runNonce : `${job.runNonce}-${attempt}`

  const target = await (deps.target ?? demoStore)(job, deps.env)
  const paypal = deps.paypal
    ? deps.paypal()
    : deps.env.paypal
      ? sandboxPayPalSide(new PayPalSandboxClient(deps.env.paypal))
      : undefined

  let written: Promise<void> = Promise.resolve()
  const bus = new EventBus()
  bus.on((event) => {
    // The job frames the run with its own events; a step's campaign events would only repeat them.
    if (event.type.startsWith('campaign:')) return
    written = written.then(() => deps.events.append(job.id, event))
  })

  const result = await runCampaign({
    target,
    paypal,
    cast: [persona],
    seed: job.seed,
    campaignId: job.id,
    runNonce,
    resume,
    bus,
    budget: { wallClockMs: 5 * 60_000 },
    modules: deps.modules,
  })
  await written
  if (!result.streams) throw new Error('The engine did not say where its random streams ended.')
  const step: CustomerStep = {
    persona,
    target: result.target,
    outcomes: saveRun(result).outcomes,
    streams: result.streams,
  }
  if (result.stoppedEarly) step.stoppedEarly = result.stoppedEarly
  return step
}
