import { motion } from '@shakedown/tokens'
import { describe, expect, it } from 'vitest'
import { cubicBezier, ease, seededRandom, shakeAt, springAt, windowProgress } from './timeline'

describe('timeline math', () => {
  it('computes window progress with clamping', () => {
    expect(windowProgress(50, 100, 200)).toBe(0)
    expect(windowProgress(200, 100, 200)).toBe(0.5)
    expect(windowProgress(999, 100, 200)).toBe(1)
    expect(windowProgress(100, 100, 0)).toBe(1)
  })

  it('matches cubic-bezier endpoints and the linear case', () => {
    const linear = cubicBezier([0, 0, 1, 1])
    for (const p of [0, 0.25, 0.5, 0.75, 1]) expect(linear(p)).toBeCloseTo(p, 5)
    expect(ease.standard(0)).toBe(0)
    expect(ease.standard(1)).toBe(1)
    expect(ease.standard(0.5)).toBeGreaterThan(0.5)
  })

  it('lets the overshoot easing go past 1 before settling', () => {
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => ease.overshoot((i + 1) / 100)))
    expect(peak).toBeGreaterThan(1)
  })

  it('settles the stamp spring at 1, with an overshoot', () => {
    const samples = Array.from({ length: 120 }, (_, i) => springAt(i * 10, motion.spring.stamp))
    expect(springAt(0, motion.spring.stamp)).toBe(0)
    expect(Math.max(...samples)).toBeGreaterThan(1)
    expect(springAt(3000, motion.spring.stamp)).toBeCloseTo(1, 3)
  })

  it('handles critically and over-damped springs', () => {
    expect(springAt(2000, { damping: 2 * Math.sqrt(100), stiffness: 100, mass: 1 })).toBeCloseTo(
      1,
      3,
    )
    expect(springAt(5000, { damping: 60, stiffness: 100, mass: 1 })).toBeCloseTo(1, 2)
  })

  it('shakes briefly and then stops', () => {
    expect(shakeAt(0, 100)).toBe(0)
    expect(Math.abs(shakeAt(140, 100))).toBeGreaterThan(0)
    expect(shakeAt(100 + motion.shake.ms + 1, 100)).toBe(0)
  })

  it('produces the same sequence for the same seed', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
