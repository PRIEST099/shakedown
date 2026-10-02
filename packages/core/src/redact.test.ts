import { describe, expect, it } from 'vitest'
import { describeSecret, REDACTED, redactSecrets, secretValues } from './redact'

describe('redaction', () => {
  it('removes every occurrence of each secret', () => {
    const text = 'token=abc123xyz then again abc123xyz and key=k-999'
    expect(redactSecrets(text, ['abc123xyz', 'k-999'])).toBe(
      `token=${REDACTED} then again ${REDACTED} and key=${REDACTED}`,
    )
  })

  it('ignores unset and very short values', () => {
    expect(redactSecrets('a b c', [undefined, 'a'])).toBe('a b c')
  })

  it('collects only secret keys from the env', () => {
    const values = secretValues({
      PAYPAL_CLIENT_ID: 'public-id',
      PAYPAL_CLIENT_SECRET: 'secret-1',
      ANTHROPIC_API_KEY: 'secret-2',
    })
    expect(values).toEqual(['secret-1', 'secret-2'])
  })

  it('describes a secret without revealing it', () => {
    expect(describeSecret('supersecretvalue')).toBe(`set (16 chars, ${REDACTED})`)
    expect(describeSecret(undefined)).toBe('missing')
  })
})
