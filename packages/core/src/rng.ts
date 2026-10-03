/**
 * Deterministic randomness. A campaign seed must reproduce the same run, so nothing in the
 * engine may reach for Math.random or crypto.randomUUID.
 */

const HEX = '0123456789abcdef'

export interface Rng {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [0, maxExclusive). */
  int(maxExclusive: number): number
  /** A reproducible identifier, shaped like the ones PayPal issues. */
  id(prefix: string, length?: number): string
  pick<T>(items: readonly T[]): T
}

/** mulberry32: small, fast, and good enough for picking fixtures. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (maxExclusive: number) => Math.floor(next() * Math.max(1, maxExclusive))
  return {
    next,
    int,
    id(prefix, length = 12) {
      let out = ''
      for (let i = 0; i < length; i += 1) out += HEX[int(16)]
      return `${prefix}-${out.toUpperCase()}`
    },
    pick<T>(items: readonly T[]): T {
      const chosen = items[int(items.length)]
      if (chosen === undefined) throw new Error('Cannot pick from an empty list.')
      return chosen
    },
  }
}
