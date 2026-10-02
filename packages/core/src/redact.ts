import { SECRET_ENV_KEYS } from './env'

export const REDACTED = '[redacted]'

/** Replace every occurrence of each secret in `text`. Very short values are ignored. */
export function redactSecrets(text: string, secrets: Iterable<string | undefined>): string {
  let out = text
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join(REDACTED)
  }
  return out
}

/** The secret values present in an env-like object, for use with `redactSecrets`. */
export function secretValues(env: Partial<Record<string, string | undefined>>): string[] {
  return SECRET_ENV_KEYS.map((key) => env[key]).filter((v): v is string => Boolean(v))
}

/** Describe a secret without revealing any of it. */
export function describeSecret(value: string | undefined): string {
  return value ? `set (${value.length} chars, ${REDACTED})` : 'missing'
}
