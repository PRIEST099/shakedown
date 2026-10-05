import { describe, expect, it } from 'vitest'
import { FPS } from './script'
import { frameIn, leaksOf, lengthOf, liveCut, place, stings, type Take } from './timeline'

const line = (t: number, persona: string, amount: string, verdict = 'leak', check = 'A check') => ({
  t,
  type: 'mark' as const,
  label: 'line',
  box: { x: 0, y: 0, width: 10, height: 10 },
  data: { persona, amount, evidence: `${check} · ID-1`, verdict },
})

/** A run like the live-run take: two customers' leaks, the run done, then the sealed re-run. */
const take: Take = {
  take: 'live-run',
  durationMs: 60_000,
  width: 1920,
  height: 1080,
  events: [
    { t: 5_000, type: 'mark', label: 'run-started' },
    line(20_000, 'double-clicker', '−$24.00', 'leak', 'One checkout is charged once'),
    line(29_000, 'double-clicker', '−$48.00', 'leak', 'A retried capture never ships twice'),
    line(36_000, 'cart-shuffler', '−$123.00'),
    { t: 40_000, type: 'mark', label: 'run-done' },
    { t: 44_000, type: 'mark', label: 'rerun-started' },
    line(55_000, 'double-clicker', '$0.00', 'sealed'),
  ],
}

describe('speed-ramped cuts', () => {
  const cut = place([
    { from: 0, to: 4, rate: 1 },
    { from: 4, to: 12, rate: 4 },
  ])

  it('lay segments end to end, each as long as its speed makes it', () => {
    expect(cut.map((s) => [s.start, s.frames])).toEqual([
      [0, 4 * FPS],
      [4 * FPS, 2 * FPS],
    ])
    expect(lengthOf(cut)).toBe(6 * FPS)
  })

  it('find the frame that shows a moment of the take', () => {
    expect(frameIn(cut, 2)).toBe(2 * FPS)
    expect(frameIn(cut, 8)).toBe(5 * FPS)
    expect(frameIn(cut, 99)).toBe(6 * FPS)
  })
})

describe('the printed leaks', () => {
  it('cost what each one added to its line, and stop at the end of the first run', () => {
    expect(leaksOf(take).map((leak) => [leak.persona, leak.amountCents, leak.check])).toEqual([
      ['double-clicker', -2400, 'One checkout is charged once'],
      ['double-clicker', -2400, 'A retried capture never ships twice'],
      ['cart-shuffler', -12300, 'A check'],
    ])
  })

  it('time the live scene: real speed for the click, faster while the receipt prints', () => {
    const { cut, end, leaks } = liveCut(take)
    expect(cut[0]?.rate).toBe(1)
    expect(cut.at(-1)?.rate).toBe(2)
    expect(end).toBe(lengthOf(cut))
    const frames = leaks.map((leak) => leak.frame)
    expect(frames).toEqual([...frames].sort((a, b) => a - b))
    expect(Math.max(...frames)).toBeLessThanOrEqual(end)
  })
})

describe('leak sounds', () => {
  it('play at most three a second, the first of each cluster winning', () => {
    expect(stings([0, 3, 12, 20, 21, 40])).toEqual([0, 12, 40])
  })
})
