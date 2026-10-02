import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SECRET_ENV_KEYS } from './env'

// .env.example is committed. Real values belong only in the gitignored .env.local.
describe('.env.example', () => {
  const example = readFileSync(join(import.meta.dirname, '../../../.env.example'), 'utf8')
  const value = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(example)?.[1]?.trim() ?? ''

  it.each([...SECRET_ENV_KEYS.filter((k) => k !== 'DATABASE_URL'), 'PAYPAL_CLIENT_ID'])(
    'leaves %s empty',
    (key) => {
      expect(value(key)).toBe('')
    },
  )

  it('only carries the local development database default', () => {
    expect(value('DATABASE_URL')).toBe('postgres://shakedown:shakedown@localhost:5432/shakedown')
  })
})
