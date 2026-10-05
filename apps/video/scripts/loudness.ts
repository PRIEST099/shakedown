/**
 * Loudness and peaks for mastering, in plain TypeScript: Remotion's ffmpeg has loudnorm but no
 * limiter, and a −14 LUFS master of a score with sharp stings needs one.
 *
 * - `integratedLoudness` is ITU-R BS.1770-4: K-weighting, 400 ms blocks every 100 ms, the absolute
 *   gate at −70 LUFS and the relative gate 10 LU under.
 * - `limit` is a look-ahead true-peak limiter: the gain eases down before a peak arrives and
 *   recovers after it, and holds the waveform between samples under the ceiling too.
 */

/** K-weighting at 48 kHz (BS.1770-4, table 1 and 2): a high shelf, then the RLB high-pass. */
const STAGES = [
  {
    b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
    a: [-1.69065929318241, 0.73248077421585],
  },
  { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] },
] as const

function kWeighted(x: Float32Array): Float64Array {
  let signal = Float64Array.from(x)
  for (const { b, a } of STAGES) {
    const out = new Float64Array(signal.length)
    let x1 = 0
    let x2 = 0
    let y1 = 0
    let y2 = 0
    for (let i = 0; i < signal.length; i += 1) {
      const x0 = signal[i] ?? 0
      const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2
      out[i] = y0
      x2 = x1
      x1 = x0
      y2 = y1
      y1 = y0
    }
    signal = out
  }
  return signal
}

/** Integrated loudness of a stereo signal, in LUFS (−Infinity for silence). */
export function integratedLoudness(left: Float32Array, right: Float32Array, rate = 48_000) {
  // Running sums of the K-weighted squares, so each block's energy is one subtraction.
  const sums = new Float64Array(left.length + 1)
  const l = kWeighted(left)
  const r = kWeighted(right)
  for (let i = 0; i < l.length; i += 1) {
    sums[i + 1] = (sums[i] ?? 0) + (l[i] ?? 0) ** 2 + (r[i] ?? 0) ** 2
  }
  const block = Math.round(0.4 * rate)
  const hop = Math.round(0.1 * rate)
  const powers: number[] = []
  for (let start = 0; start + block <= l.length; start += hop) {
    powers.push(((sums[start + block] ?? 0) - (sums[start] ?? 0)) / block)
  }
  const lufs = (power: number) => -0.691 + 10 * Math.log10(power)
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
  const loud = powers.filter((p) => lufs(p) > -70)
  if (loud.length === 0) return Number.NEGATIVE_INFINITY
  const relative = lufs(mean(loud)) - 10
  return lufs(mean(loud.filter((p) => lufs(p) > relative)))
}

/**
 * Each sample's peak with the waveform between it and the next sample: the sample itself and
 * three points interpolated at quarter steps (4× oversampling, as BS.1770-4 measures true peak),
 * through a Hann-windowed sinc of 16 taps per phase.
 */
export function truePeaks(x: Float32Array): Float32Array {
  const half = 8
  const phases = [0.25, 0.5, 0.75].map((frac) => {
    const taps = Array.from({ length: 2 * half }, (_, k) => {
      const t = k - half + 1 - frac
      const sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
      const hann = 0.5 + 0.5 * Math.cos((Math.PI * t) / (half + 1))
      return sinc * hann
    })
    const sum = taps.reduce((a, b) => a + b, 0)
    return taps.map((tap) => tap / sum)
  })
  const n = x.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    let peak = Math.abs(x[i] ?? 0)
    for (const taps of phases) {
      let y = 0
      for (let k = 0; k < taps.length; k += 1) {
        const j = i + k - half + 1
        if (j >= 0 && j < n) y += (taps[k] ?? 0) * (x[j] ?? 0)
      }
      peak = Math.max(peak, Math.abs(y))
    }
    out[i] = peak
  }
  return out
}

/** The largest absolute sample of either channel, in dBFS. */
export function samplePeak(left: Float32Array, right: Float32Array) {
  let peak = 0
  for (let i = 0; i < left.length; i += 1) {
    peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0))
  }
  return 20 * Math.log10(peak || 1e-12)
}

/**
 * Limits both channels in place so neither the samples nor the waveform between them (4×
 * oversampled) exceeds `ceilingDb`. The gain each sample needs is
 * held for the look-ahead and averaged over it, which makes the gain fall smoothly *before* the
 * peak and stay at or under what every sample needs; then it recovers over `release` seconds.
 */
export function limit(
  left: Float32Array,
  right: Float32Array,
  ceilingDb: number,
  rate = 48_000,
  lookahead = 0.005,
  release = 0.08,
) {
  const n = left.length
  const ceiling = 10 ** (ceilingDb / 20)
  const ahead = Math.max(1, Math.round(lookahead * rate))
  // Measured between samples too, so the peaks a DAC or an encoder would reconstruct are held.
  const peaksL = truePeaks(left)
  const peaksR = truePeaks(right)
  const need = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const peak = Math.max(peaksL[i] ?? 0, peaksR[i] ?? 0)
    need[i] = peak > ceiling ? ceiling / peak : 1
  }
  // The smallest need from each sample to `ahead` samples later: a sliding minimum, O(n).
  const held = new Float32Array(n)
  const queue: number[] = []
  let head = 0
  for (let i = n - 1; i >= 0; i -= 1) {
    while (queue.length > head && (need[queue[queue.length - 1] ?? 0] ?? 1) >= (need[i] ?? 1)) {
      queue.pop()
    }
    queue.push(i)
    while ((queue[head] ?? 0) > i + ahead) head += 1
    held[i] = need[queue[head] ?? i] ?? 1
  }
  // Averaging the held gain over the look-ahead gives a smooth fall that is still never above
  // what any sample in the window needs.
  const sums = new Float64Array(n + 1)
  for (let i = 0; i < n; i += 1) sums[i + 1] = (sums[i] ?? 0) + (held[i] ?? 1)
  const recover = 1 - Math.exp(-1 / (release * rate))
  let gain = 1
  for (let i = 0; i < n; i += 1) {
    // Over the samples that exist: at the very start the window is shorter, never padded with
    // unity gain, or a peak in the first few milliseconds would get through.
    const from = Math.max(0, i - ahead + 1)
    const smooth = ((sums[i + 1] ?? 0) - (sums[from] ?? 0)) / (i + 1 - from)
    gain = smooth < gain ? smooth : gain + (smooth - gain) * recover
    left[i] = (left[i] ?? 0) * gain
    right[i] = (right[i] ?? 0) * gain
  }
}

/**
 * Masters a stereo signal to a loudness target under a peak ceiling: a gain, the limiter, and a
 * correction or two for the loudness the limiter takes away.
 */
export function master(
  left: Float32Array,
  right: Float32Array,
  target: { lufs: number; ceilingDb: number },
  rate = 48_000,
) {
  let gainDb = target.lufs - integratedLoudness(left, right, rate)
  let out = { left, right, lufs: Number.NaN }
  for (let pass = 0; pass < 4; pass += 1) {
    const g = 10 ** (gainDb / 20)
    const l = left.map((v) => v * g)
    const r = right.map((v) => v * g)
    limit(l, r, target.ceilingDb, rate)
    const lufs = integratedLoudness(l, r, rate)
    out = { left: l, right: r, lufs }
    if (Math.abs(lufs - target.lufs) < 0.1) break
    gainDb += target.lufs - lufs
  }
  return out
}
