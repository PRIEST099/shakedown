import { describe, expect, it } from 'vitest'
import { integratedLoudness, limit, master, samplePeak, truePeaks } from './loudness'

const RATE = 48_000
const sine = (dbfs: number, seconds = 5, hz = 997) =>
  Float32Array.from(
    { length: seconds * RATE },
    (_, i) => 10 ** (dbfs / 20) * Math.sin((2 * Math.PI * hz * i) / RATE),
  )

describe('integrated loudness (BS.1770-4)', () => {
  it('reads a 997 Hz tone at −20 dBFS in both channels as −20 LUFS', () => {
    const tone = sine(-20)
    expect(integratedLoudness(tone, tone)).toBeCloseTo(-20, 1)
  })

  it('reads a full-scale tone in one channel as −3 LUFS', () => {
    expect(integratedLoudness(sine(0), new Float32Array(5 * RATE))).toBeCloseTo(-3.01, 1)
  })

  it('gates out silence', () => {
    const quiet = new Float32Array(5 * RATE)
    expect(integratedLoudness(quiet, quiet)).toBe(Number.NEGATIVE_INFINITY)
  })
})

describe('the limiter', () => {
  it('holds every sample under the ceiling and leaves the music away from the peak alone', () => {
    const left = sine(-20, 2)
    left[RATE] = 1
    const right = Float32Array.from(left)
    const untouched = left[RATE / 2] ?? 0
    limit(left, right, -6)
    expect(samplePeak(left, right)).toBeLessThanOrEqual(-6 + 1e-6)
    expect(left[RATE / 2]).toBeCloseTo(untouched, 6)
  })
})

describe('true peaks', () => {
  it('find the peak between samples that the samples themselves miss', () => {
    // A tone at a quarter of the sample rate, phased so every sample lands at ±0.707 of the crest.
    const tone = Float32Array.from({ length: 4800 }, (_, i) =>
      Math.sin((Math.PI / 2) * i + Math.PI / 4),
    )
    const peaks = truePeaks(tone)
    expect(Math.abs(tone[100] ?? 0)).toBeCloseTo(Math.SQRT1_2, 3)
    expect(Math.max(...peaks.slice(100, 4700))).toBeGreaterThan(0.98)
  })
})

describe('mastering', () => {
  it('reaches the loudness target under the ceiling, stings and all', () => {
    const left = sine(-24, 6)
    for (let s = 0; s < 6; s += 1) left[s * RATE + 100] = 0.99
    const right = Float32Array.from(left)
    const out = master(left, right, { lufs: -14, ceilingDb: -2 })
    expect(out.lufs).toBeCloseTo(-14, 0)
    expect(Math.abs(out.lufs + 14)).toBeLessThan(0.1)
    expect(samplePeak(out.left, out.right)).toBeLessThanOrEqual(-2 + 1e-6)
  })
})
