import { z } from 'zod'

/** Keys whose values must never appear in logs, errors or reports. */
export const SECRET_ENV_KEYS = [
  'PAYPAL_CLIENT_SECRET',
  'ANTHROPIC_API_KEY',
  'SHAKEDOWN_PROBE_SECRET',
  'DATABASE_URL',
  'STORE_DATABASE_URL',
  'CONSOLE_DATABASE_URL',
  'RENDER_API_KEY',
] as const

// .env files often leave keys present but empty; treat those as unset.
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalString = z.preprocess(blankToUndefined, z.string().trim().min(1).optional())

export const envSchema = z.object({
  PAYPAL_ENV: z.preprocess(
    blankToUndefined,
    z
      .literal('sandbox', {
        error: 'Shakedown only runs against the PayPal sandbox. Set PAYPAL_ENV=sandbox.',
      })
      .default('sandbox'),
  ),
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  DATABASE_URL: z.preprocess(blankToUndefined, z.url({ error: 'Must be a valid URL.' }).optional()),
  SHAKEDOWN_PROBE_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(16, { error: 'Use at least 16 characters.' }).optional(),
  ),
  STORE_DATABASE_URL: z.preprocess(
    blankToUndefined,
    z.url({ error: 'Must be a valid URL.' }).optional(),
  ),
  PAYPAL_WEBHOOK_ID: optionalString,
  SHAKEDOWN_VERIFICATION_TOKEN: z.preprocess(
    blankToUndefined,
    z.string().min(16, { error: 'Use at least 16 characters.' }).optional(),
  ),
})

export type ShakedownEnv = z.infer<typeof envSchema>
export type EnvKey = keyof ShakedownEnv

export class EnvError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid environment:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`)
    this.name = 'EnvError'
    this.issues = issues
  }
}

/** Parse and validate the environment. Error messages name keys, never values. */
export function loadEnv(source: Record<string, string | undefined> = process.env): ShakedownEnv {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
  }
  return result.data
}

/** Assert that the given keys are set, with a helpful message for the ones that aren't. */
export function requireEnv<K extends EnvKey>(
  env: ShakedownEnv,
  keys: readonly K[],
): ShakedownEnv & { [P in K]-?: NonNullable<ShakedownEnv[P]> } {
  const missing = keys.filter((key) => env[key] === undefined)
  if (missing.length > 0) {
    throw new EnvError(missing.map((key) => `${key}: missing. Add it to .env.local.`))
  }
  return env as ShakedownEnv & { [P in K]-?: NonNullable<ShakedownEnv[P]> }
}
