import { describe, expect, it } from 'vitest'
import { createRng } from './rng'

describe('createRng', () => {
  it('replays exactly from the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const take = (rng: ReturnType<typeof createRng>) => [rng.next(), rng.id('WH'), rng.int(100)]
    expect(take(a)).toEqual(take(b))
  })

  it('diverges on a different seed', () => {
    expect(createRng(1).id('WH')).not.toBe(createRng(2).id('WH'))
  })

  it('stays inside its ranges', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(rng.int(5)).toBeLessThan(5)
    }
  })

  it('mints identifiers shaped like the ones PayPal issues', () => {
    expect(createRng(3).id('WH')).toMatch(/^WH-[0-9A-F]{12}$/)
    expect(createRng(3).id('CMP', 6)).toMatch(/^CMP-[0-9A-F]{6}$/)
  })

  it('refuses to pick from nothing', () => {
    expect(() => createRng(1).pick([])).toThrow(/empty/)
  })
})
