import { describe, expect, it } from 'vitest'
import { PERSONA_IDS } from './cast'
import { allLeaky, allSealed, parseMode, sealedCount } from './mode'

describe('store mode', () => {
  it('has exactly one switch per member of the cast', () => {
    expect(Object.keys(allLeaky()).sort()).toEqual([...PERSONA_IDS].sort())
    expect(sealedCount(allLeaky())).toBe(0)
    expect(sealedCount(allSealed())).toBe(6)
  })

  it('reads untrusted input conservatively', () => {
    expect(parseMode(null)).toEqual(allLeaky())
    expect(parseMode('sealed')).toEqual(allLeaky())
    const mode = parseMode({ echo: 'sealed', bouncer: 'SEALED', nonsense: 'sealed' })
    expect(mode.echo).toBe('sealed')
    expect(mode.bouncer).toBe('leaky')
    expect(Object.keys(mode)).not.toContain('nonsense')
  })

  it('can start from a different base', () => {
    expect(parseMode({ echo: 'leaky' }, allSealed()).echo).toBe('leaky')
    expect(parseMode({ echo: 'leaky' }, allSealed()).bouncer).toBe('sealed')
  })
})
