import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chatAllowedFrom,
  checkoutAllowed,
  clientAddress,
  deliveryAllowed,
  RateLimiter,
} from './rate-limit'

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

describe('the public store’s limits', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const from = (address: string, extra: Record<string, string> = {}) =>
    new Request('http://store.test/api/checkout/orders', {
      method: 'POST',
      headers: { 'x-forwarded-for': address, ...extra },
    })
  const times = (n: number, check: () => boolean) => Array.from({ length: n }, check)

  it('leave local development and CI alone', () => {
    const request = from('10.1.0.1')
    expect(times(50, () => checkoutAllowed(request, undefined)).every(Boolean)).toBe(true)
    expect(times(50, () => deliveryAllowed(request, undefined)).every(Boolean)).toBe(true)
    expect(times(50, () => chatAllowedFrom(request)).every(Boolean)).toBe(true)
  })

  it('give a shopper a shopper’s worth of checkouts, and a campaign its whole cast', () => {
    vi.stubEnv('SHAKEDOWN_JUDGE_MODE', '1')
    const shopper = from('10.2.0.1')
    expect(times(20, () => checkoutAllowed(shopper, undefined)).every(Boolean)).toBe(true)
    expect(checkoutAllowed(shopper, undefined)).toBe(false)
    expect(checkoutAllowed(from('10.2.0.2'), undefined)).toBe(true)
    // Campaigns all come from the same server, so they are counted by campaign instead.
    expect(times(30, () => checkoutAllowed(shopper, 'CMP-LIMITS0001')).every(Boolean)).toBe(true)
  })

  it('cap test deliveries and chat per address', () => {
    vi.stubEnv('SHAKEDOWN_JUDGE_MODE', '1')
    const caller = from('10.3.0.1')
    expect(times(30, () => deliveryAllowed(caller, undefined)).every(Boolean)).toBe(true)
    expect(deliveryAllowed(caller, undefined)).toBe(false)
    expect(deliveryAllowed(caller, 'CMP-LIMITS0002')).toBe(true)
    expect(times(30, () => chatAllowedFrom(caller)).every(Boolean)).toBe(true)
    expect(chatAllowedFrom(caller)).toBe(false)
  })

  it('on Render, trust the address Cloudflare wrote over one the caller wrote', () => {
    const spoofed = from('1.2.3.4', { 'cf-connecting-ip': '203.0.113.7' })
    expect(clientAddress(spoofed)).toBe('1.2.3.4')
    vi.stubEnv('RENDER', 'true')
    expect(clientAddress(spoofed)).toBe('203.0.113.7')
  })
})
