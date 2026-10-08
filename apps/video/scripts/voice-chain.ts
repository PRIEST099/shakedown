/**
 * The broadcast voice chain, in plain TypeScript (Remotion's ffmpeg has no EQ or compressor): what
 * a voiceover gets in a studio before it meets the music.
 *
 * 1. High-pass at 80 Hz: rumble and handling noise out.
 * 2. −2 dB at 250 Hz: the boxy, "in a cupboard" weight.
 * 3. +2.5 dB at 3.2 kHz: presence, so every consonant reads over the score.
 * 4. +2 dB shelf from 8 kHz: air.
 * 5. A de-esser: the band above 5.5 kHz is turned down, by up to 6 dB, only while an "s" spikes.
 * 6. A gentle compressor, 2.5:1 over −22 dB: the loud words and the quiet ones closer together,
 *    as a narrator's are.
 *
 * Filters are the RBJ cookbook biquads. The line is levelled afterwards, so the chain adds no gain.
 */

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number }

function highpass(f: number, rate: number, q = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * f) / rate
  const alpha = Math.sin(w) / (2 * q)
  const cos = Math.cos(w)
  const a0 = 1 + alpha
  return {
    b0: (1 + cos) / 2 / a0,
    b1: -(1 + cos) / a0,
    b2: (1 + cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  }
}

function peaking(f: number, rate: number, gainDb: number, q = 1): Biquad {
  const A = 10 ** (gainDb / 40)
  const w = (2 * Math.PI * f) / rate
  const alpha = Math.sin(w) / (2 * q)
  const cos = Math.cos(w)
  const a0 = 1 + alpha / A
  return {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * cos) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha / A) / a0,
  }
}

function highShelf(f: number, rate: number, gainDb: number): Biquad {
  const A = 10 ** (gainDb / 40)
  const w = (2 * Math.PI * f) / rate
  const cos = Math.cos(w)
  const alpha = (Math.sin(w) / 2) * Math.SQRT2
  const root = 2 * Math.sqrt(A) * alpha
  const a0 = A + 1 - (A - 1) * cos + root
  return {
    b0: (A * (A + 1 + (A - 1) * cos + root)) / a0,
    b1: (-2 * A * (A - 1 + (A + 1) * cos)) / a0,
    b2: (A * (A + 1 + (A - 1) * cos - root)) / a0,
    a1: (2 * (A - 1 - (A + 1) * cos)) / a0,
    a2: (A + 1 - (A - 1) * cos - root) / a0,
  }
}

function filter(x: Float32Array, { b0, b1, b2, a1, a2 }: Biquad): Float32Array {
  const out = new Float32Array(x.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i += 1) {
    const x0 = x[i] ?? 0
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
  }
  return out
}

const dbOf = (v: number) => 20 * Math.log10(Math.max(v, 1e-9))
const coefficient = (seconds: number, rate: number) => Math.exp(-1 / (seconds * rate))

/** Turns the band above 5.5 kHz down while it runs hot: the "s" sounds, not the voice. */
function deEss(x: Float32Array, rate: number, thresholdDb = -32, maxCutDb = 6): Float32Array {
  const high = filter(filter(x, highpass(5500, rate)), highpass(5500, rate))
  const out = new Float32Array(x.length)
  const attack = coefficient(0.002, rate)
  const release = coefficient(0.06, rate)
  let env = 0
  for (let i = 0; i < x.length; i += 1) {
    const h = high[i] ?? 0
    const level = Math.abs(h)
    env = level > env ? attack * env + (1 - attack) * level : release * env + (1 - release) * level
    const over = dbOf(env) - thresholdDb
    const cut = over > 0 ? Math.min(maxCutDb, over * 0.6) : 0
    // The rest of the signal plus the band at its reduced gain: at no cut, exactly the input.
    out[i] = (x[i] ?? 0) - h + h * 10 ** (-cut / 20)
  }
  return out
}

/** A feed-forward compressor with a soft knee, on an RMS-ish envelope. */
function compress(
  x: Float32Array,
  rate: number,
  { thresholdDb = -22, ratio = 2.5, kneeDb = 6, attack = 0.008, release = 0.12 } = {},
): Float32Array {
  const out = new Float32Array(x.length)
  const detect = coefficient(0.01, rate)
  const att = coefficient(attack, rate)
  const rel = coefficient(release, rate)
  let power = 0
  let reduction = 0
  for (let i = 0; i < x.length; i += 1) {
    const v = x[i] ?? 0
    power = detect * power + (1 - detect) * v * v
    const level = dbOf(Math.sqrt(power))
    const over = level - thresholdDb
    let target = 0
    if (over >= kneeDb / 2) target = over * (1 - 1 / ratio)
    else if (over > -kneeDb / 2)
      target = ((1 - 1 / ratio) * (over + kneeDb / 2) ** 2) / (2 * kneeDb)
    reduction =
      target > reduction
        ? att * reduction + (1 - att) * target
        : rel * reduction + (1 - rel) * target
    out[i] = v * 10 ** (-reduction / 20)
  }
  return out
}

/** One voice line through the whole chain. Mono in, mono out, same length. */
export function broadcastVoice(x: Float32Array, rate: number): Float32Array {
  let y = filter(x, highpass(80, rate))
  y = filter(y, peaking(250, rate, -2))
  y = filter(y, peaking(3200, rate, 2.5))
  y = filter(y, highShelf(8000, rate, 2))
  y = deEss(y, rate)
  return compress(y, rate)
}
