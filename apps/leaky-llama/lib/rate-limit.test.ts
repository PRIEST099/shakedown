import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rate-limit'

describe('RateLimiter', () => {
  it('allows up to the limit per key, then refuses until the window passes', () => {
    let now = 0
    const limiter = new RateLimiter(3, 1000, () => now)
    expect([1, 2, 3, 4].map(() => limiter.allow('order-1'))).toEqual([true, true, true, false])
    expect(limiter.allow('order-2')).toBe(true)
    now = 1001
    expect(limiter.allow('order-1')).toBe(true)
  })
})
