import { type CubicBezier, motion, type SpringConfig } from '@shakedown/tokens'

/**
 * Pure, deterministic animation math. Components receive progress values, never timers,
 * so the same component renders identically on the web (rAF) and in Remotion (frames).
 */

export const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x)

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p

/** Linear progress of `t` through the window that starts at `start` and lasts `duration`. */
export function windowProgress(t: number, start: number, duration: number): number {
  if (duration <= 0) return t >= start ? 1 : 0
  return clamp01((t - start) / duration)
}

/** CSS-style cubic-bezier easing function. */
export function cubicBezier([x1, y1, x2, y2]: CubicBezier): (p: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx

  const solveX = (x: number): number => {
    let s = x
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x
      if (Math.abs(error) < 1e-7) return s
      const slope = slopeX(s)
      if (Math.abs(slope) < 1e-7) break
      s -= error / slope
    }
    let lo = 0
    let hi = 1
    s = x
    for (let i = 0; i < 40; i++) {
      const value = sampleX(s)
      if (Math.abs(value - x) < 1e-7) break
      if (value < x) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return s
  }

  return (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : sampleY(solveX(p)))
}

export const ease = {
  standard: cubicBezier(motion.ease.standard),
  exit: cubicBezier(motion.ease.exit),
  overshoot: cubicBezier(motion.ease.overshoot),
  print: cubicBezier(motion.ease.print),
  tear: cubicBezier(motion.ease.tear),
}

/**
 * A damped spring released from rest at 0 toward 1, `ms` after release.
 * Closed form, so it is identical frame by frame. Underdamped springs overshoot past 1.
 */
export function springAt(ms: number, { damping, stiffness, mass }: SpringConfig): number {
  if (ms <= 0) return 0
  const t = ms / 1000
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const decay = Math.exp(-zeta * w0 * t)
    return 1 - decay * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
  }
  if (zeta === 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t)
  const root = Math.sqrt(zeta * zeta - 1)
  const r1 = -w0 * (zeta - root)
  const r2 = -w0 * (zeta + root)
  const a = -r2 / (r2 - r1)
  const b = r1 / (r2 - r1)
  return 1 + a * Math.exp(r1 * t) + b * Math.exp(r2 * t)
}

/** A short decaying shake (2 px × 2 cycles by default) that starts at `start`. Returns px. */
export function shakeAt(t: number, start: number): number {
  const { px, cycles, ms } = motion.shake
  const p = windowProgress(t, start, ms)
  if (p <= 0 || p >= 1) return 0
  return px * Math.sin(2 * Math.PI * cycles * p) * (1 - p)
}

/** Deterministic pseudo-random numbers (mulberry32), for seeded blinks and jitter. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
