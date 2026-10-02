import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv, requireEnv } from './env'

describe('loadEnv', () => {
  it('defaults PAYPAL_ENV to sandbox and treats blank values as unset', () => {
    const env = loadEnv({ PAYPAL_CLIENT_ID: '', ANTHROPIC_API_KEY: '   ' })
    expect(env.PAYPAL_ENV).toBe('sandbox')
    expect(env.PAYPAL_CLIENT_ID).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('refuses a live PayPal environment', () => {
    expect(() => loadEnv({ PAYPAL_ENV: 'live' })).toThrow(/only runs against the PayPal sandbox/)
  })

  it('never puts secret values into error messages', () => {
    const secret = 'short-probe'
    try {
      loadEnv({ SHAKEDOWN_PROBE_SECRET: secret, DATABASE_URL: 'not a url with p4ssw0rd' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError)
      const message = (error as Error).message
      expect(message).toContain('SHAKEDOWN_PROBE_SECRET')
      expect(message).toContain('DATABASE_URL')
      expect(message).not.toContain(secret)
      expect(message).not.toContain('p4ssw0rd')
    }
  })
})

describe('requireEnv', () => {
  it('names every missing key', () => {
    const env = loadEnv({ PAYPAL_CLIENT_ID: 'abc' })
    expect(() => requireEnv(env, ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'])).toThrow(
      /PAYPAL_CLIENT_SECRET: missing/,
    )
  })

  it('passes when keys are present', () => {
    const env = loadEnv({ PAYPAL_CLIENT_ID: 'abc', PAYPAL_CLIENT_SECRET: 'def' })
    expect(requireEnv(env, ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']).PAYPAL_CLIENT_SECRET).toBe(
      'def',
    )
  })
})
