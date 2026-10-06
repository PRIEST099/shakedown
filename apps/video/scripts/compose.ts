/**
 * The score, composed in code: an original piece for this video, synthesised from oscillators
 * and seeded noise, so there is no sample, no loop and no licence to worry about. It follows the
 * script's scenes and lands its two signature sounds on the picture: LEAK on every receipt line
 * as it prints, SEALED on the frame the re-run seals. Those frames come from src/timeline.ts,
 * the same functions the scenes cut with, reading the takes' event logs.
 *
 *   pnpm --filter @shakedown/video compose
 *
 * Writes the film's score and the teaser's, each raw and then loudness-normalised with Remotion's
 * ffmpeg: public/audio/score.wav and public/audio/teaser.wav.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  DEMO_FRAMES,
  FPS,
  framesOf,
  phraseAt,
  SCENES,
  type SceneId,
  START,
  sentenceAt,
} from '../src/script'
import {
  anchorsFor,
  fixCut,
  hookCut,
  liveCut,
  stings,
  storeCut,
  type Take,
  teaserCut,
} from '../src/timeline'

const ROOT = path.resolve(import.meta.dirname, '..')
const RATE = 48_000
// The track being written: begin() sets its length, finish() writes it.
let LENGTH = 0
let N = 0
let L = new Float32Array(0)
let R = new Float32Array(0)

function begin(seconds: number) {
  LENGTH = seconds
  N = Math.ceil(seconds * RATE)
  L = new Float32Array(N)
  R = new Float32Array(N)
}

// ---------- small, deterministic DSP ----------
let seed = 2026
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 2 ** 31 - 1
}
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
const at = (sec: number) => Math.max(0, Math.min(N - 1, Math.round(sec * RATE)))

function add(start: number, samples: Float32Array, gain = 1, pan = 0) {
  const i0 = at(start)
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < samples.length && i0 + i < N; i += 1) {
    L[i0 + i] = (L[i0 + i] ?? 0) + (samples[i] ?? 0) * gl
    R[i0 + i] = (R[i0 + i] ?? 0) + (samples[i] ?? 0) * gr
  }
}

function render(seconds: number, voice: (t: number, i: number) => number) {
  const out = new Float32Array(Math.ceil(seconds * RATE))
  for (let i = 0; i < out.length; i += 1) out[i] = voice(i / RATE, i)
  return out
}

const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d))

function lowpass(samples: Float32Array, cutoff: number) {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE)
  let y = 0
  for (let i = 0; i < samples.length; i += 1) {
    y += k * ((samples[i] ?? 0) - y)
    samples[i] = y
  }
  return samples
}

// ---------- instruments ----------
const kick = () =>
  render(
    0.45,
    (t) =>
      Math.sin(2 * Math.PI * (45 * t + (75 / 18) * (1 - Math.exp(-18 * t)))) * Math.exp(-t / 0.16),
  )
const tick = (bright = 1) => {
  const s = render(0.05, (t) => noise() * Math.exp(-t / 0.008) * bright)
  let prev = 0
  for (let i = 0; i < s.length; i += 1) {
    const v = s[i] ?? 0
    s[i] = v - prev
    prev = v
  }
  return s
}
/** Karplus-Strong: a plucked string, warm and woody. */
function pluck(midi: number, seconds = 1.2, damping = 0.996) {
  const period = Math.round(RATE / hz(midi))
  const ring = new Float32Array(period).map(() => noise())
  return render(seconds, (_, i) => {
    const j = i % period
    const next = ((ring[j] ?? 0) + (ring[(j + 1) % period] ?? 0)) * 0.5 * damping
    const out = ring[j] ?? 0
    ring[j] = next
    return out * Math.min(1, (seconds - i / RATE) * 4)
  })
}
function bass(midi: number, seconds: number) {
  const f = hz(midi)
  return lowpass(
    render(seconds, (t) => (((t * f) % 1) * 2 - 1) * env(t, 0.01, seconds * 0.7) * 0.9),
    420,
  )
}
function pad(chord: number[], seconds: number) {
  return lowpass(
    render(seconds, (t) => {
      let v = 0
      for (const midi of chord)
        for (const detune of [-0.06, 0.06]) v += ((t * hz(midi + detune)) % 1) * 2 - 1
      const shape = Math.min(1, t / 1.2) * Math.min(1, (seconds - t) / 1.5)
      return (v / (chord.length * 2)) * shape
    }),
    900,
  )
}
/** FM bell: a clear, slightly metallic ring for the receipt and the stamp. */
const bell = (midi: number, seconds = 2.2) =>
  render(seconds, (t) => {
    const f = hz(midi)
    const index = 2.4 * Math.exp(-t / 0.6)
    return (
      Math.sin(2 * Math.PI * f * t + index * Math.sin(2 * Math.PI * f * 3.5 * t)) *
      Math.exp(-t / 0.7)
    )
  })

/** LEAK: two quick falling tones, a printer's red ink. */
function leak() {
  const a = render(0.16, (t) => Math.sin(2 * Math.PI * hz(76) * t) * env(t, 0.004, 0.06))
  const b = render(
    0.3,
    (t) =>
      Math.sin(2 * Math.PI * hz(75) * t + 1.5 * Math.sin(2 * Math.PI * hz(75) * 2 * t)) *
      env(t, 0.004, 0.12),
  )
  const out = new Float32Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, Math.round(0.09 * RATE))
  return out
}
/** SEALED: a rubber stamp's thud, then a major chord ringing out. */
function sealed() {
  const thud = render(
    0.35,
    (t) =>
      (Math.sin(2 * Math.PI * (60 * t + 4 * (1 - Math.exp(-30 * t)))) * 0.8 +
        noise() * 0.5 * Math.exp(-t / 0.02)) *
      Math.exp(-t / 0.09),
  )
  const chord = [62, 66, 69, 74].map((m) => bell(m, 2.6))
  const out = new Float32Array(Math.max(thud.length, chord[0]?.length ?? 0) + RATE)
  out.set(thud, 0)
  const offset = Math.round(0.06 * RATE)
  for (const c of chord) {
    for (let i = 0; i < c.length; i += 1)
      out[i + offset] = (out[i + offset] ?? 0) + (c[i] ?? 0) * 0.22
  }
  return out
}

// ---------- the arrangement ----------
const BEAT = 60 / 96
const sceneOf = (id: SceneId) => SCENES.find((x) => x.id === id) ?? SCENES[0]
const sec = (id: SceneId) => START[id] / FPS
const end = (id: SceneId) => sec(id) + framesOf(sceneOf(id)) / FPS
const said = (id: SceneId, sentence: number, anchors?: Partial<Record<number, number>>) =>
  sec(id) + sentenceAt(sceneOf(id), sentence, { anchors }) / FPS
const D_MINOR = [50, 53, 57, 62, 65, 69]
const take = (name: string) =>
  JSON.parse(readFileSync(path.join(ROOT, `public/footage/${name}.json`), 'utf8')) as Take
const liveRun = take('live-run')

function groove(
  from: number,
  to: number,
  opts: { kick?: boolean; hats?: number; bassLine?: number[]; gain?: number },
) {
  const g = opts.gain ?? 1
  for (let t = from, n = 0; t < to - 0.05; t += BEAT, n += 1) {
    if (opts.kick && n % 2 === 0) add(t, kick(), 0.5 * g)
    if (opts.bassLine)
      add(t, bass(opts.bassLine[n % opts.bassLine.length] ?? 0, BEAT * 0.95), 0.22 * g)
    for (let h = 0; h < (opts.hats ?? 0); h += 1)
      add(t + (h * BEAT) / (opts.hats ?? 1), tick(h % 2 ? 0.6 : 1), 0.12 * g, h % 2 ? 0.3 : -0.3)
  }
}

/** The film: follows the script's scenes. */
function scoreFilm() {
  begin(DEMO_FRAMES / FPS)
  // Hook: a low pulse and a rising hiss under the receipt at speed, a small LEAK per printed line,
  // and the full LEAK when the total lands.
  const hook = hookCut(liveRun)
  add(
    0,
    lowpass(
      render(hook.land / FPS, (t) => noise() * (t / (hook.land / FPS)) ** 2 * 0.5),
      3000,
    ),
    0.25,
  )
  groove(0, end('hook'), { kick: true, gain: 0.7 })
  for (const frame of stings(hook.leaks.map((leak) => leak.frame)).filter((f) => f < hook.land - 8))
    add(sec('hook') + frame / FPS, leak(), 0.24, 0.3)
  add(sec('hook') + hook.land / FPS, leak(), 0.55)

  // The problem: plucked D minor, one note per line, a soft beat under it.
  groove(sec('problem'), end('problem'), { kick: true, hats: 2, gain: 0.6 })
  for (let i = 0; i < 4; i += 1) {
    add(said('problem', i), pluck((D_MINOR[i + 1] ?? 53) + 12, 1.6), 0.35, i % 2 ? 0.4 : -0.4)
  }
  add(said('problem', 4) + 14 / FPS, bell(81, 1.4), 0.18)

  // Meet Shakedown: a warm pad that opens up under the wordmark.
  add(sec('meet'), pad([50, 57, 62, 65], 7.5), 0.35)
  add(sec('meet') + 7.5, pad([46, 53, 58, 62], end('meet') - sec('meet') - 7.5), 0.35)
  add(sec('meet') + 30 / FPS, bell(74, 2.4), 0.2)

  // The cast: the groove proper, and a pluck as each card is dealt.
  groove(sec('cast'), end('cast'), { kick: true, hats: 2, bassLine: [38, 38, 41, 43], gain: 0.85 })
  for (let i = 0; i < 5; i += 1)
    add(said('cast', i), pluck((D_MINOR[i % D_MINOR.length] ?? 0) + 12, 1.4), 0.32, -0.6 + i * 0.3)

  // The store: a shop bell as the door opens, the groove kept low, a pluck as the switches open.
  const store = storeCut(take('store'))
  groove(sec('store'), end('store'), { kick: true, hats: 2, bassLine: [38, 38, 41, 43], gain: 0.6 })
  add(sec('store') + 0.15, bell(81, 1.8), 0.16)
  add(sec('store') + store.switches / FPS, pluck(69, 1.6), 0.3)

  // The live run: the receipt printer's sixteenths, a LEAK as each line prints, a low thud when
  // the total settles.
  const live = liveCut(liveRun)
  groove(sec('live'), sec('live') + live.end / FPS, {
    kick: true,
    hats: 4,
    bassLine: [38, 38, 41, 43, 38, 38, 45, 43],
    gain: 0.85,
  })
  groove(sec('live') + live.end / FPS, end('live'), { kick: true, gain: 0.5 })
  for (const frame of stings(live.leaks.map((leak) => leak.frame)))
    add(sec('live') + frame / FPS, leak(), 0.42)
  add(sec('live') + live.end / FPS, bass(33, 1.6), 0.5)
  add(sec('live') + live.end / FPS, leak(), 0.5)

  // One leak followed: down to a pad and a pulse, and a LEAK as its sum lands.
  add(sec('proof'), pad([50, 57, 60, 65], end('proof') - sec('proof')), 0.3)
  groove(sec('proof'), end('proof'), { kick: true, gain: 0.45 })
  const leaked = phraseAt(sceneOf('proof'), 2, 'leaked', { anchors: anchorsFor('proof') })
  add(sec('proof') + leaked / FPS, leak(), 0.4)

  // AI vs code: a doubtful chord, and a LEAK when the ledger's verdict is called out.
  add(sec('ai-vs-code'), pad([50, 57, 64, 65], end('ai-vs-code') - sec('ai-vs-code')), 0.3)
  add(said('ai-vs-code', 3) + 1.6, leak(), 0.45)

  // The fix: a climbing arpeggio through the re-run, the SEALED stamp, then D major.
  const fix = fixCut(liveRun)
  const sealedAt = sec('fix') + fix.sealed / FPS
  for (
    let t = sec('fix') + (fix.cut[1]?.start ?? 57) / FPS, n = 0;
    t < sealedAt - 0.1;
    t += BEAT / 2, n += 1
  )
    add(
      t,
      pluck((D_MINOR[n % D_MINOR.length] ?? 0) + 12 + Math.floor(n / 6) * 2, 0.6),
      0.22,
      n % 2 ? 0.35 : -0.35,
    )
  groove(sec('fix'), sealedAt, { kick: true, hats: 4, gain: 0.7 })
  add(sealedAt, sealed(), 0.7)
  add(sealedAt + 0.4, pad([50, 54, 57, 62], end('fix') - sealedAt - 0.4), 0.32)

  // The close: D major, a bell motif on the end card, and out.
  const card = sec('close') + 9.7
  add(sec('close'), pad([50, 54, 57, 62, 66], end('close') - sec('close')), 0.34)
  for (const [i, m] of [74, 78, 81, 86].entries()) add(card + i * BEAT, bell(m, 2.6), 0.16)
  fadeOut(3)
  finish('score')
  return sealedAt
}

/** The teaser: 40 s that loop, so it fades in and out. */
function scoreTeaser() {
  const cut = teaserCut(liveRun)
  begin(cut.frames / FPS)
  const f = (frame: number) => frame / FPS
  add(
    0,
    lowpass(
      render(f(cut.totalAt), (t) => noise() * (t / f(cut.totalAt)) ** 2 * 0.5),
      3000,
    ),
    0.25,
  )
  groove(0, f(cut.castAt), { kick: true, gain: 0.7 })
  for (const frame of stings(cut.hook.leaks.map((leak) => leak.frame)).filter(
    (x) => x < cut.totalAt - 8,
  ))
    add(f(frame), leak(), 0.24, 0.3)
  add(f(cut.totalAt), leak(), 0.55)
  add(f(cut.totalAt), bass(33, 1.6), 0.5)
  groove(f(cut.castAt), f(cut.sealAt), {
    kick: true,
    hats: 2,
    bassLine: [38, 38, 41, 43],
    gain: 0.85,
  })
  for (let i = 0; i < 5; i += 1) {
    const at0 = f(cut.castAt + i * cut.card)
    add(at0, pluck((D_MINOR[i % D_MINOR.length] ?? 0) + 12, 1.4), 0.32, -0.6 + i * 0.3)
    add(at0 + 0.5, leak(), 0.3)
  }
  for (let t = f(cut.sealAt), n = 0; t < f(cut.sealedFrame) - 0.1; t += BEAT / 2, n += 1)
    add(
      t,
      pluck((D_MINOR[n % D_MINOR.length] ?? 0) + 12 + Math.floor(n / 6) * 2, 0.6),
      0.22,
      n % 2 ? 0.35 : -0.35,
    )
  groove(f(cut.sealAt), f(cut.sealedFrame), { kick: true, hats: 4, gain: 0.7 })
  add(f(cut.sealedFrame), sealed(), 0.7)
  add(
    f(cut.sealedFrame) + 0.4,
    pad([50, 54, 57, 62], f(cut.frames) - f(cut.sealedFrame) - 0.4),
    0.32,
  )
  for (const [i, m] of [74, 78, 81, 86].entries()) add(f(cut.endAt) + i * BEAT, bell(m, 2.6), 0.16)
  fadeIn(0.3)
  fadeOut(1.5)
  finish('teaser')
}

function fadeIn(seconds: number) {
  for (let i = 0; i < Math.min(N, seconds * RATE); i += 1) {
    const k = i / (seconds * RATE)
    L[i] = (L[i] ?? 0) * k
    R[i] = (R[i] ?? 0) * k
  }
}

function fadeOut(seconds: number) {
  for (let i = at(LENGTH - seconds); i < N; i += 1) {
    const k = (N - i) / (seconds * RATE)
    L[i] = (L[i] ?? 0) * k
    R[i] = (R[i] ?? 0) * k
  }
}

// ---------- write and normalise ----------
function finish(name: string) {
  const wav = Buffer.alloc(44 + N * 4)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + N * 4, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(2, 22)
  wav.writeUInt32LE(RATE, 24)
  wav.writeUInt32LE(RATE * 4, 28)
  wav.writeUInt16LE(4, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(N * 4, 40)
  let max = 0.0001
  for (let i = 0; i < N; i += 1) max = Math.max(max, Math.abs(L[i] ?? 0), Math.abs(R[i] ?? 0))
  const scale = 0.89 / max
  for (let i = 0; i < N; i += 1) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, (L[i] ?? 0) * scale)) * 32767), 44 + i * 4)
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, (R[i] ?? 0) * scale)) * 32767), 46 + i * 4)
  }
  mkdirSync(path.join(ROOT, 'public/audio'), { recursive: true })
  const raw = path.join(ROOT, `public/audio/${name}.raw.wav`)
  writeFileSync(raw, wav)
  normalise(raw, path.join(ROOT, `public/audio/${name}.wav`))
}

/** Remotion's own ffmpeg; loudnorm reports on stderr, so that is what comes back. */
function ffmpeg(args: string[]) {
  const run = spawnSync(
    'pnpm',
    ['exec', 'remotion', 'ffmpeg', '-hide_banner', '-nostats', ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  )
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`)
  return run.stderr
}

/**
 * Two-pass loudnorm (VIDEO_PIPELINE §4.5): measure the track, then apply one linear gain to the
 * target. Music alone sits a little under the platform's -14 LUFS, leaving room for the voiceover.
 */
function normalise(input: string, output: string) {
  const spec = 'I=-18:TP=-1.5:LRA=11'
  const report = ffmpeg([
    '-i',
    input,
    '-af',
    `loudnorm=${spec}:print_format=json`,
    '-f',
    'null',
    '-',
  ])
  const json = /\{[^{}]*"input_i"[^{}]*\}/s.exec(report)?.[0]
  if (!json) throw new Error('loudnorm printed no measurement.')
  const m = JSON.parse(json) as Record<string, string>
  const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`
  ffmpeg([
    '-y',
    '-i',
    input,
    '-af',
    `loudnorm=${spec}:${measured}:linear=true`,
    '-ar',
    String(RATE),
    output,
  ])
}

const sealedAt = scoreFilm()
scoreTeaser()
console.log(
  `Composed the film (${(DEMO_FRAMES / FPS).toFixed(1)} s; SEALED at ${sealedAt.toFixed(2)} s) and the teaser. Wrote public/audio/score.wav and teaser.wav.`,
)
