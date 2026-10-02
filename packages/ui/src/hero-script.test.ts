import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_RUN, totalCents } from './fixtures'
import { HERO_TIMING, heroFrame } from './hero-script'

describe('hero choreography', () => {
  it('starts blank and finishes sealed at $0.00 within 5 seconds', () => {
    const start = heroFrame(PLACEHOLDER_RUN, 0)
    expect(start.before.lines.every((l) => l.print === 0)).toBe(true)
    expect(start.stamp).toBe(0)

    const end = heroFrame(PLACEHOLDER_RUN, HERO_TIMING.endMs)
    expect(end.done).toBe(true)
    expect(HERO_TIMING.endMs).toBeLessThanOrEqual(5000)
    expect(end.after.total).toEqual({ fromCents: -15300, toCents: 0, progress: 1 })
    expect(end.after.lines.every((l) => l.print === 1)).toBe(true)
    expect(end.stamp).toBeGreaterThan(0.9)
  })

  it('ticks the total once per leak line, never continuously', () => {
    const afterFirst = heroFrame(PLACEHOLDER_RUN, 1000 - 1)
    expect(afterFirst.before.total).toMatchObject({ fromCents: 0, toCents: -3600 })
    const afterAll = heroFrame(PLACEHOLDER_RUN, 3000)
    expect(afterAll.before.total).toMatchObject({ fromCents: -13500, toCents: -15300, progress: 1 })
    expect(totalCents(PLACEHOLDER_RUN.before)).toBe(-15300)
  })

  it('is deterministic', () => {
    expect(heroFrame(PLACEHOLDER_RUN, 2345)).toEqual(heroFrame(PLACEHOLDER_RUN, 2345))
  })

  it('labels placeholder data honestly', () => {
    expect(PLACEHOLDER_RUN.source).toBe('placeholder')
    expect(PLACEHOLDER_RUN.label).toMatch(/not real sandbox data/)
  })
})
