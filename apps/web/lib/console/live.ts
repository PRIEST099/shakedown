import { randomBytes } from 'node:crypto'
import {
  allLeaky,
  allSealed,
  EventBus,
  httpStoreTarget,
  loadEnv,
  PERSONA_MODULES,
  type PersonaId,
  type RunEvent,
  runCampaign,
  type StoreMode,
  sandboxPayPalSide,
  signCampaignToken,
} from '@shakedown/core'
import { PayPalSandboxClient } from '@shakedown/paypal'
import { LIVE_CAST } from './labels'
import { describeSwitches, type FindingRow, findingRow } from './rows'
import { getConsoleDb, storeCampaign } from './store'

/**
 * Live campaigns from the console. They run against Shakedown's own demo store (never anyone
 * else's), one at a time, with only the customers that need no AI, so a click costs nothing but
 * sandbox calls. Events go to every open stream as they happen; the run is stored when it ends.
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
  | { type: 'stored'; campaignId: string }
  | { type: 'failed'; reason: string }

const titleOf = (persona: PersonaId, scenario: string) =>
  PERSONA_MODULES[persona]?.scenarios.find((s) => s.id === scenario)?.title ?? scenario

/** The engine's events, translated for the console. */
export function toLiveEvents(
  event: RunEvent,
  context: { campaignId: string; current?: { persona: PersonaId; scenario: string } },
): LiveEvent[] {
  switch (event.type) {
    case 'scenario:started':
      context.current = { persona: event.persona, scenario: event.scenario }
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
    case 'scenario:finished':
      return [
        {
          type: 'scenario',
          persona: event.persona,
          title: context.current ? titleOf(context.current.persona, context.current.scenario) : '',
          state: 'done',
          leaks: event.findings,
        },
      ]
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
    default:
      return []
  }
}

export interface LiveCampaign {
  id: string
  switches: StoreMode
  startedAt: string
  events: LiveEvent[]
  done: boolean
  listeners: Set<(event: LiveEvent) => void>
}

export class LiveCampaignError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'LiveCampaignError'
  }
}

const holder = globalThis as unknown as { __shakedownLive?: Map<string, LiveCampaign> }
if (!holder.__shakedownLive) holder.__shakedownLive = new Map<string, LiveCampaign>()
const registry = holder.__shakedownLive

export const getLiveCampaign = (id: string) => registry.get(id)

/** The demo store this console may test: its own Leaky Llama, by default on :3100. */
export function demoStoreUrl(): string {
  return process.env.LEAKY_LLAMA_URL?.trim() || 'http://localhost:3100'
}

export async function startLiveCampaign(
  options: { switches: 'leaky' | 'sealed'; seed?: number },
  deps: { runner?: typeof runCampaign } = {},
): Promise<LiveCampaign> {
  if ([...registry.values()].some((campaign) => !campaign.done)) {
    throw new LiveCampaignError('A campaign is already running. Watch that one finish first.', 409)
  }
  const env = loadEnv(process.env)
  if (!env.SHAKEDOWN_PROBE_SECRET) {
    throw new LiveCampaignError(
      'SHAKEDOWN_PROBE_SECRET is not set, so the store cannot be read.',
      503,
    )
  }
  const switches = options.switches === 'sealed' ? allSealed() : allLeaky()
  const id = `CMP-${randomBytes(6).toString('hex').toUpperCase()}`
  const campaign: LiveCampaign = {
    id,
    switches,
    startedAt: new Date().toISOString(),
    events: [],
    done: false,
    listeners: new Set(),
  }
  const emit = (event: LiveEvent) => {
    campaign.events.push(event)
    for (const listener of campaign.listeners) listener(event)
  }
  const finish = (event: LiveEvent) => {
    emit(event)
    campaign.done = true
    campaign.listeners.clear()
  }

  const token = await signCampaignToken(
    { campaignId: id, exp: Date.now() + 20 * 60_000, mode: switches },
    env.SHAKEDOWN_PROBE_SECRET,
  )
  const target = await httpStoreTarget({
    baseUrl: demoStoreUrl(),
    probeSecret: env.SHAKEDOWN_PROBE_SECRET,
    campaignToken: token,
  }).catch((error: Error) => {
    throw new LiveCampaignError(
      `The demo store at ${demoStoreUrl()} is not answering: ${error.message}`,
      503,
    )
  })
  const paypal =
    env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET
      ? sandboxPayPalSide(
          new PayPalSandboxClient({
            clientId: env.PAYPAL_CLIENT_ID,
            clientSecret: env.PAYPAL_CLIENT_SECRET,
          }),
        )
      : undefined

  const bus = new EventBus()
  const context: Parameters<typeof toLiveEvents>[1] = { campaignId: id }
  bus.on((event) => {
    for (const live of toLiveEvents(event, context)) emit(live)
  })
  registry.set(id, campaign)
  emit({
    type: 'started',
    campaignId: id,
    switches: describeSwitches(switches),
    mode: switches,
    startedAt: campaign.startedAt,
  })
  // Keep only the latest few finished runs' event buffers.
  for (const [key, old] of registry) if (old.done && registry.size > 5) registry.delete(key)

  void (deps.runner ?? runCampaign)({
    target,
    paypal,
    cast: LIVE_CAST,
    seed: options.seed ?? 2026,
    campaignId: id,
    bus,
    budget: { wallClockMs: 10 * 60_000 },
  })
    .then(async (result) => {
      const db = await getConsoleDb()
      const stored = await storeCampaign(db, result, { source: 'live', switches })
      finish({ type: 'stored', campaignId: stored })
    })
    .catch((error: Error) => finish({ type: 'failed', reason: error.message }))

  return campaign
}

/** Follow a campaign: everything so far, then each event as it happens, until it ends. */
export function followCampaign(campaign: LiveCampaign, listener: (event: LiveEvent) => void) {
  for (const event of campaign.events) listener(event)
  if (campaign.done) return () => {}
  campaign.listeners.add(listener)
  return () => campaign.listeners.delete(listener)
}
