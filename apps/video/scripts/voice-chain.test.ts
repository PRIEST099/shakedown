import { describe, expect, it } from 'vitest'
import { broadcastVoice } from './voice-chain'

const RATE = 48_000
const tone = (hz: number, seconds: number, amp = 0.3) =>
  Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE),
  )
const rms = (x: Float32Array, from = 0) => {
  let sum = 0
  for (let i = from; i < x.length; i += 1) sum += (x[i] ?? 0) ** 2
  return Math.sqrt(sum / (x.length - from))
}

describe('the broadcast voice chain', () => {
  it('keeps the length, and stays silent on silence', () => {
    const out = broadcastVoice(new Float32Array(RATE), RATE)
    expect(out.length).toBe(RATE)
    expect(out.every((v) => v === 0)).toBe(true)
  })

  it('takes rumble out and keeps the voice band', () => {
    const settle = RATE / 2
    const rumble = broadcastVoice(tone(30, 1, 0.05), RATE)
    const voice = broadcastVoice(tone(1000, 1, 0.05), RATE)
    expect(rms(rumble, settle) / rms(tone(30, 1, 0.05), settle)).toBeLessThan(0.2)
    expect(rms(voice, settle) / rms(tone(1000, 1, 0.05), settle)).toBeGreaterThan(0.8)
  })

  it('brings loud passages closer to quiet ones', () => {
    const settle = RATE / 2
    const quiet = rms(broadcastVoice(tone(1000, 1, 0.02), RATE), settle)
    const loud = rms(broadcastVoice(tone(1000, 1, 0.5), RATE), settle)
    // 28 dB apart going in; less coming out.
    expect(20 * Math.log10(loud / quiet)).toBeLessThan(24)
  })

  it('never produces NaN or runaway values', () => {
    const out = broadcastVoice(tone(6000, 0.5, 0.9), RATE)
    expect(out.every((v) => Number.isFinite(v) && Math.abs(v) < 2)).toBe(true)
  })
})
