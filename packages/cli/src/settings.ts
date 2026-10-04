import { ConfigError, DEFAULT_CAST, PERSONA_NAMES, validateConfig } from './config'
import type { PersonaName, RefundPolicy, Seal, ShakedownConfig } from './define'

/** Everything `run` accepts on the command line. Flags win over the config file. */
export interface RunFlags {
  config?: string
  target?: string
  cast?: string
  seed?: string
  switches?: string
  budget?: string
  explain?: boolean
  strict?: boolean
  ci?: boolean
  out?: string
  'env-file'?: string
}

export interface RunSettings {
  targetUrl: string
  allowHosts: string[]
  cast: PersonaName[]
  seed: number
  switches?: Partial<Record<PersonaName, Seal>>
  policy?: RefundPolicy
  aiHeadroomUsd: number
  minutes: number
  requests?: number
  explain: boolean
  strict: boolean
  outDir: string
}

const DEFAULT_SEED = 2026
const DEFAULT_MINUTES = 10

function number(flag: string, value: string): number {
  const parsed = Number(value)
  if (value.trim() === '' || !Number.isFinite(parsed))
    throw new ConfigError(`--${flag} must be a number.`)
  return parsed
}

/** Merge the config file and the flags, then validate the result like any other config. */
export function resolveSettings(file: ShakedownConfig | undefined, flags: RunFlags): RunSettings {
  const url = flags.target ?? file?.target.url
  if (!url) {
    throw new ConfigError(
      'No target. Add shakedown.config.ts (see the README), or pass --target http://localhost:3000.',
    )
  }
  const merged: ShakedownConfig = {
    ...file,
    target: { ...file?.target, url },
    cast: flags.cast
      ? (flags.cast
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean) as PersonaName[])
      : file?.cast,
    seed: flags.seed === undefined ? file?.seed : number('seed', flags.seed),
    switches:
      flags.switches === undefined
        ? file?.switches
        : (flags.switches as ShakedownConfig['switches']),
    budget: {
      ...file?.budget,
      ...(flags.budget === undefined ? {} : { aiUsd: number('budget', flags.budget) }),
    },
    explain: flags.explain || file?.explain,
    strict: flags.strict || file?.strict,
    outDir: flags.out ?? file?.outDir,
  }
  // The file was checked when it loaded, so anything wrong here came from a flag.
  const config = validateConfig(merged, 'command-line flags')
  return {
    targetUrl: config.target.url,
    allowHosts: config.target.allowHosts ?? [],
    cast: [...new Set(config.cast ?? DEFAULT_CAST)].sort(
      (a, b) => PERSONA_NAMES.indexOf(a) - PERSONA_NAMES.indexOf(b),
    ),
    seed: config.seed ?? DEFAULT_SEED,
    switches:
      typeof config.switches === 'string'
        ? Object.fromEntries(PERSONA_NAMES.map((name) => [name, config.switches]))
        : config.switches,
    policy: config.policy,
    aiHeadroomUsd: config.budget?.aiUsd ?? 0,
    minutes: config.budget?.minutes ?? DEFAULT_MINUTES,
    requests: config.budget?.requests,
    explain: config.explain ?? false,
    strict: config.strict ?? false,
    outDir: config.outDir ?? '.shakedown',
  }
}
