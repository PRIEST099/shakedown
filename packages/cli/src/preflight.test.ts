import { describe, expect, it } from 'vitest'
import { EXIT } from './exit-codes'
import { preflight } from './preflight'

describe('preflight', () => {
  it('passes with sandbox credentials and never prints the secret', () => {
    const secret = 'sandbox-secret-value-123'
    const result = preflight({ PAYPAL_CLIENT_ID: 'client-id', PAYPAL_CLIENT_SECRET: secret })
    expect(result.exitCode).toBe(EXIT.pass)
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('fails preflight when credentials are missing', () => {
    const result = preflight({})
    expect(result.exitCode).toBe(EXIT.preflight)
    expect(result.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([
      'PAYPAL_CLIENT_ID',
      'PAYPAL_CLIENT_SECRET',
    ])
  })

  it('exits with the safety-lock code for a live environment', () => {
    expect(preflight({ PAYPAL_ENV: 'live' }).exitCode).toBe(EXIT.safetyLock)
  })

  it('exits with the config code for other invalid settings', () => {
    expect(preflight({ DATABASE_URL: 'nope' }).exitCode).toBe(EXIT.config)
  })
})
