import path from 'node:path'
import {
  CAST,
  createRng,
  EnvError,
  EventBus,
  type Finding,
  type HttpStoreOptions,
  httpStoreTarget,
  loadEnv,
  type PayPalSide,
  PERSONA_MODULES,
  type PolicyRules,
  parseMode,
  runCampaign,
  type ShakedownEnv,
  sandboxPayPalSide,
  saveRun,
  signCampaignToken,
  type TargetAdapter,
  TargetNotAllowedError,
} from '@shakedown/core'
import { PayPalSandboxClient } from '@shakedown/paypal'
import {
  buildReport,
  type Explanation,
  type ShakedownReport,
  scoreboard,
} from '@shakedown/reporters'
import { ConfigError, loadConfig } from './config'
import { EXIT } from './exit-codes'
import { OUTPUT_FILES, writeOutputs } from './outputs'
import { type RunFlags, type RunSettings, resolveSettings } from './settings'

/** What the AI layer does for a run. Loaded only when a run needs it. */
export interface AiKit {
  /** Claude spend on this machine since the kit was made, in US dollars. */
  spent(): number
  compilePolicy(policyText: string): Promise<PolicyRules>
  explain(finding: Finding): Promise<Explanation>
}

export interface RunIo {
  cwd: string
  env: Record<string, string | undefined>
  version: string
  /** The receipt. The real CLI prints it like a till for a person watching. */
  print: (text: string) => Promise<void> | void
  /** Progress and notes. */
  log: (line: string) => void
  signal?: AbortSignal
  fetch?: typeof fetch
  /** Tests hand in their own target, PayPal side and AI layer. */
  connect?: (options: HttpStoreOptions) => Promise<TargetAdapter>
  paypal?: PayPalSide
  ai?: (headroomUsd: number) => Promise<AiKit>
}

export async function runCommand(flags: RunFlags, io: RunIo): Promise<number> {
  let settings: RunSettings
  try {
    const loaded = await loadConfig({ cwd: io.cwd, file: flags.config })
    settings = resolveSettings(loaded?.config, flags)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    io.log(error.message)
    return EXIT.config
  }

  let env: ShakedownEnv
  try {
    env = loadEnv(io.env)
  } catch (error) {
    if (!(error instanceof EnvError)) throw error
    io.log(error.message)
    return error.issues.some((issue) => issue.startsWith('PAYPAL_ENV'))
      ? EXIT.safetyLock
      : EXIT.config
  }
  const probeSecret = env.SHAKEDOWN_PROBE_SECRET
  if (!probeSecret) {
    io.log(
      'SHAKEDOWN_PROBE_SECRET is not set. Shakedown reads what your store believes through its probe API; give the store and Shakedown the same secret (16+ characters) in .env.local.',
    )
    return EXIT.config
  }

  const paypal =
    io.paypal ??
    (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET
      ? sandboxPayPalSide(
          new PayPalSandboxClient({
            clientId: env.PAYPAL_CLIENT_ID,
            clientSecret: env.PAYPAL_CLIENT_SECRET,
          }),
        )
      : undefined)
  if (!paypal) {
    io.log(
      '  PayPal sandbox credentials are not set, so the checkout customers will be skipped. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.local.',
    )
  }

  const campaignId = createRng(settings.seed).id('CMP')
  const mode = settings.switches ? parseMode(settings.switches) : undefined
  const campaignToken = mode
    ? await signCampaignToken(
        { campaignId, exp: Date.now() + (settings.minutes + 5) * 60_000, mode },
        probeSecret,
      )
    : undefined

  let target: TargetAdapter
  try {
    target = await (io.connect ?? httpStoreTarget)({
      baseUrl: settings.targetUrl,
      probeSecret,
      campaignToken,
      policy: {
        allowHosts: settings.allowHosts,
        verificationToken: env.SHAKEDOWN_VERIFICATION_TOKEN,
      },
      fetch: io.fetch,
    })
  } catch (error) {
    if (error instanceof TargetNotAllowedError) {
      io.log(`Safety lock: ${error.message}`)
      return EXIT.safetyLock
    }
    io.log(
      `Could not reach ${settings.targetUrl}: ${describe(error)}. Is the store running? "npx @shakedown-dev/cli preflight" checks the connection.`,
    )
    return EXIT.preflight
  }

  const needsPolicy = settings.cast.includes('policy-lawyer') && !settings.policy
  let aiHeadroom = settings.aiHeadroomUsd
  if ((needsPolicy || settings.explain) && aiHeadroom > 0 && !env.ANTHROPIC_API_KEY) {
    io.log('  ANTHROPIC_API_KEY is not set, so only replayed Claude answers are available.')
    aiHeadroom = 0
  }
  const ai = needsPolicy || settings.explain ? await (io.ai ?? loadAi)(aiHeadroom) : undefined

  let policy = settings.policy
  if (needsPolicy && ai) {
    try {
      const res = await (io.fetch ?? fetch)(new URL('/api/policy', target.origin))
      if (!res.ok) throw new Error(`the store has no /api/policy route (HTTP ${res.status})`)
      policy = await ai.compilePolicy(await res.text())
      io.log("  Read the store's refund policy with Claude.")
    } catch (error) {
      io.log(
        `  The Policy Lawyer has no policy to hold the store to: ${aiProblem(error)}. Add "policy" to the config to skip this step.`,
      )
    }
  }

  const bus = new EventBus()
  showProgress(bus, io.log)
  io.log(
    `\n  Shakedown → ${target.origin} · seed ${settings.seed} · ${settings.cast.length} ${settings.cast.length === 1 ? 'customer' : 'customers'} from hell${mode ? ' · switches set for this run' : ''}\n`,
  )
  const result = await runCampaign({
    target,
    paypal,
    policy,
    seed: settings.seed,
    campaignId,
    cast: settings.cast,
    bus,
    signal: io.signal,
    budget: {
      wallClockMs: settings.minutes * 60_000,
      ...(settings.requests ? { requests: settings.requests } : {}),
    },
  })

  const explanations: Record<string, Explanation> = {}
  if (settings.explain && ai) {
    for (const finding of result.findings) {
      try {
        explanations[finding.id] = await ai.explain(finding)
      } catch (error) {
        io.log(`  Stopped explaining leaks: ${aiProblem(error)}.`)
        break
      }
    }
  }

  const report = buildReport(result, {
    tool: { name: '@shakedown-dev/cli', version: io.version },
    switches: mode,
    explanations,
    aiSpentUsd: ai?.spent(),
  })
  const outDir = path.resolve(io.cwd, settings.outDir)
  writeOutputs(outDir, report, saveRun(result, policy))
  await io.print(scoreboard(report))
  const relative = path.relative(io.cwd, outDir)
  const shown = relative.startsWith('..') ? outDir : relative || '.'
  io.log(
    `  Reports: ${shown}/${OUTPUT_FILES.html} · ${OUTPUT_FILES.json} · ${OUTPUT_FILES.junit} · ${OUTPUT_FILES.markdown}`,
  )
  return exitCodeFor(report, settings.strict)
}

/** 1 for any leak. In strict mode, 2 when anything was inconclusive, skipped or cut short. */
export function exitCodeFor(report: ShakedownReport, strict: boolean): number {
  if (report.totals.leaks > 0) return EXIT.leaks
  const incomplete =
    report.totals.inconclusive > 0 ||
    report.totals.skipped > 0 ||
    report.campaign.stoppedEarly !== undefined ||
    report.personas.some((persona) => persona.scenarios.some((scenario) => scenario.error))
  return strict && incomplete ? EXIT.inconclusive : EXIT.pass
}

async function loadAi(headroomUsd: number): Promise<AiKit> {
  const ai = await import('@shakedown/ai')
  const ledger = ai.spendLedger()
  const before = ledger.total()
  const claude = ai.createClaude({
    purpose: 'cli',
    // Never past the machine-wide cap, and never more than this run's headroom.
    budgetUsd: Math.min(ai.budgetUsd(), before + headroomUsd),
    // Replayed answers need no key; a new call without one is refused before it is sent.
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || 'replay-only',
  })
  return {
    spent: () => ledger.total() - before,
    compilePolicy: (text) => ai.compilePolicy(claude, text),
    explain: (finding) => ai.explainFinding(claude, finding),
  }
}

function showProgress(bus: EventBus, log: (line: string) => void): void {
  const names = new Map(CAST.map((persona) => [persona.id, persona.name]))
  const titles = new Map(
    Object.values(PERSONA_MODULES).flatMap(
      (module) => module?.scenarios.map((scenario) => [scenario.id, scenario.title] as const) ?? [],
    ),
  )
  let current = ''
  bus.on((event) => {
    if (event.type === 'scenario:started') current = event.scenario
    if (event.type === 'scenario:skipped') {
      log(
        `  – ${names.get(event.persona)} · ${titles.get(event.scenario) ?? event.scenario} (skipped)`,
      )
    }
    if (event.type === 'scenario:finished') {
      const leaks = event.findings
      log(
        `  ${leaks ? '✗' : '·'} ${names.get(event.persona)} · ${titles.get(current) ?? current}${leaks ? ` (${leaks} ${leaks === 1 ? 'leak' : 'leaks'})` : ''}`,
      )
    }
    if (event.type === 'campaign:failed') log(`  Campaign stopped: ${event.reason}`)
  })
}

function describe(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause
  const message = (error as Error).message ?? String(error)
  return cause ? `${message} (${cause.code ?? cause.message})` : message
}

function aiProblem(error: unknown): string {
  if ((error as { status?: number }).status === 402) {
    return 'the AI budget for this run is used up (pass --budget 0.02 to allow two cents of new Claude calls; replayed answers are free)'
  }
  return (error as Error).message ?? String(error)
}
