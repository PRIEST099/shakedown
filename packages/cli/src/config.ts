import { existsSync, readFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { PersonaName, ShakedownConfig } from './define'

export const CONFIG_FILES = [
  'shakedown.config.ts',
  'shakedown.config.mts',
  'shakedown.config.js',
  'shakedown.config.mjs',
  'shakedown.config.json',
  'shakedown.config.yaml',
  'shakedown.config.yml',
] as const

export const PERSONA_NAMES = [
  'double-clicker',
  'cart-shuffler',
  'echo',
  'bouncer',
  'policy-lawyer',
] as const satisfies readonly PersonaName[]

/** The four customers that need no AI. The Policy Lawyer talks to a model, so it is opt-in. */
export const DEFAULT_CAST: readonly PersonaName[] = [
  'double-clicker',
  'cart-shuffler',
  'echo',
  'bouncer',
]

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

const seal = z.enum(['leaky', 'sealed'])
const persona = z.enum(PERSONA_NAMES, {
  error: (issue) =>
    issue.input === 'second-opinion'
      ? 'The Second Opinion is not in this version yet.'
      : `Unknown customer ${JSON.stringify(issue.input)}. Choose from: ${PERSONA_NAMES.join(', ')}.`,
})

export const configSchema = z.strictObject({
  target: z.strictObject({
    url: z.url({ protocol: /^https?$/, error: 'Must be an http or https URL.' }),
    allowHosts: z.array(z.string().min(1)).optional(),
  }),
  cast: z.array(persona).min(1).optional(),
  seed: z.int().nonnegative().optional(),
  switches: z.union([seal, z.partialRecord(persona, seal)]).optional(),
  policy: z
    .strictObject({
      windowDays: z.int().positive().nullable(),
      selfServeLimitCents: z.int().nonnegative().nullable(),
      capAtAmountPaid: z.boolean(),
      requiresOrderEmail: z.boolean(),
      noRefundDuringDispute: z.boolean(),
    })
    .optional(),
  budget: z
    .strictObject({
      aiUsd: z.number().nonnegative().optional(),
      minutes: z.number().positive().max(60).optional(),
      requests: z.int().positive().optional(),
    })
    .optional(),
  explain: z.boolean().optional(),
  strict: z.boolean().optional(),
  outDir: z.string().min(1).optional(),
})

const SECRET_LIKE = /secret|token|password|api.?key|credential/i

/** Validate a config from any source. Messages name the setting, never echo a value. */
export function validateConfig(input: unknown, source: string): ShakedownConfig {
  const result = configSchema.safeParse(input)
  if (result.success) return result.data
  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(top level)'}: ${issue.message}`,
  )
  const secretKey = result.error.issues.some(
    (issue) =>
      issue.code === 'unrecognized_keys' && issue.keys.some((key) => SECRET_LIKE.test(key)),
  )
  if (secretKey) {
    lines.push('  Secrets belong in the environment (.env.local), never in the config file.')
  }
  throw new ConfigError(`Invalid ${source}:\n${lines.join('\n')}`)
}

export interface LoadedConfig {
  config: ShakedownConfig
  file: string
}

/** Find and load the config: `--config <path>`, or the first `shakedown.config.*` in `cwd`. */
export async function loadConfig(options: {
  cwd: string
  file?: string
}): Promise<LoadedConfig | undefined> {
  const file = options.file
    ? path.resolve(options.cwd, options.file)
    : CONFIG_FILES.map((name) => path.join(options.cwd, name)).find((candidate) =>
        existsSync(candidate),
      )
  if (!file) return undefined
  if (!existsSync(file)) throw new ConfigError(`No config file at ${file}.`)
  return { config: validateConfig(await readConfigFile(file), path.basename(file)), file }
}

async function readConfigFile(file: string): Promise<unknown> {
  const name = path.basename(file)
  const extension = path.extname(file)
  if (extension === '.json' || extension === '.yaml' || extension === '.yml') {
    const text = readFileSync(file, 'utf8')
    try {
      return extension === '.json' ? JSON.parse(text) : parseYaml(text)
    } catch (error) {
      throw new ConfigError(`Could not parse ${name}: ${(error as Error).message}`)
    }
  }
  if (!['.ts', '.mts', '.js', '.mjs'].includes(extension)) {
    throw new ConfigError(`${name}: use .ts, .mts, .js, .mjs, .json, .yaml or .yml.`)
  }
  answerSelfImports()
  let loaded: { default?: unknown }
  try {
    loaded = (await import(pathToFileURL(file).href)) as { default?: unknown }
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      throw new ConfigError(
        `Node ${process.versions.node} cannot load ${name}. Use Node 22.18 or later, or write the config as JSON or YAML.`,
      )
    }
    throw new ConfigError(`Could not load ${name}: ${(error as Error).message}`)
  }
  if (loaded.default === undefined) throw new ConfigError(`${name} has no default export.`)
  return loaded.default
}

let answering = false

/** Let `import { defineConfig } from '@shakedown-dev/cli'` work even when run through npx. */
function answerSelfImports(): void {
  if (answering || typeof nodeModule.registerHooks !== 'function') return
  answering = true
  const own = new URL(`./define${import.meta.url.endsWith('.ts') ? '.ts' : '.js'}`, import.meta.url)
    .href
  nodeModule.registerHooks({
    resolve: (specifier, context, nextResolve) =>
      specifier === '@shakedown-dev/cli'
        ? { url: own, format: 'module', shortCircuit: true }
        : nextResolve(specifier, context),
  })
}
