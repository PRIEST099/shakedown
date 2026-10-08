/**
 * The scratch voiceover (VIDEO_PIPELINE §4.2): each sentence of the script read by Kokoro-82M, an
 * open-weight speech model (Apache-2.0) run locally, so the animatic can be timed to real speech
 * before you record your own voice. Never macOS system voices.
 *
 *   pnpm --filter @shakedown/video voice                 # every line
 *   pnpm --filter @shakedown/video voice --scene=proof   # one scene's lines, keeping the rest
 *   pnpm --filter @shakedown/video voice --probe "the AI" "in CI"   # the phonemes it would say
 *   pnpm --filter @shakedown/video voice --film=walkthrough   # the walkthrough, in a male voice
 *
 * The first run downloads the model (about 330 MB) from Hugging Face into the transformers.js
 * cache under node_modules. It writes public/audio/vo/<scene>/<n>.wav, 48 kHz with each line at
 * about −16 LUFS after the broadcast voice chain (scripts/voice-chain.ts), and src/data/vo.json, each line's text and length, which the cut is timed from.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KokoroTTS, TextSplitterStream } from 'kokoro-js'
import { SCENES, type Scene, sentences } from '../src/script'
import { voiced } from '../src/spoken'
import { W_SCENES } from '../src/walkthrough/script'
import { integratedLoudness, limit } from './loudness'
import { broadcastVoice } from './voice-chain'
import { decode, floatWav, RATE } from './wav'

const ROOT = path.resolve(import.meta.dirname, '..')
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const DTYPE = 'fp32'
const LINE_LUFS = -16

/**
 * Each film's script, voice and pace. The walkthrough is a man explaining his screen: Fable, the
 * model's British male narrator (picked from an audition of six), at about its natural pace, and
 * each sentence read alone, with the pauses the cut places between them.
 */
const FILMS = {
  demo: {
    scenes: SCENES as readonly Scene[],
    voice: 'af_heart',
    speed: 1,
    whole: false,
    file: 'vo.json',
  },
  walkthrough: {
    scenes: W_SCENES as readonly Scene[],
    voice: 'bm_fable',
    speed: 0.96,
    // Fable reads a whole scene with almost no pause between sentences, so each is read alone
    // and the cut places the pauses.
    whole: false,
    file: 'vo-walkthrough.json',
  },
} as const
const FILM =
  FILMS[
    (process.argv.find((a) => a.startsWith('--film='))?.slice('--film='.length) ??
      'demo') as keyof typeof FILMS
  ] ?? FILMS.demo
const VOICE =
  process.argv.find((a) => a.startsWith('--voice='))?.slice('--voice='.length) ?? FILM.voice

/** One recorded line: the sentence as written, and how long the take runs. */
type Take = { text: string; seconds: number }

const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' })

if (process.argv.includes('--probe')) {
  for (const text of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
    const splitter = new TextSplitterStream()
    const stream = tts.stream(splitter, { voice: VOICE as 'af_heart' })
    splitter.push(voiced(text))
    splitter.close()
    for await (const chunk of stream) console.log(`${text}  →  ${chunk.phonemes}`)
  }
} else {
  await speak()
}
// Release the ONNX session before exit: tearing it down mid-exit aborts the process.
await tts.model.dispose()

/**
 * The speech without the silence or breath the model leaves around it, plus 60 ms before and a
 * 120 ms fade after (room for a final "t" or "s"). Levels are 50 ms averages, judged against the
 * take itself: Fable leaves 0.7 s of breath at −40 to −50 dB after the last word, flickering past
 * any fixed gate frame by frame, while a word's own ending stays within about 20 dB of the loud
 * parts.
 */
function trim(samples: Float32Array, rate: number) {
  const hop = Math.round(0.01 * rate)
  const power: number[] = []
  for (let s = 0; s + hop <= samples.length; s += hop) {
    let sum = 0
    for (let i = s; i < s + hop; i += 1) sum += (samples[i] ?? 0) ** 2
    power.push(sum / hop)
  }
  const levels = power.map((_, k) => {
    const window = power.slice(Math.max(0, k - 2), k + 3)
    return Math.sqrt(window.reduce((a, b) => a + b, 0) / window.length)
  })
  const sorted = [...levels].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 1
  // 12 dB over the floor, and at least 24 dB under the loud parts. Never under −50 dBFS.
  const gate = Math.max(10 ** (-50 / 20), floor * 10 ** (12 / 20), loud * 10 ** (-24 / 20))
  let first = 0
  let last = levels.length - 1
  while (first < last && (levels[first] ?? 0) < gate) first += 1
  while (last > first && (levels[last] ?? 0) < gate) last -= 1
  const pad = Math.round(0.06 * rate)
  const tail = Math.round(0.12 * rate)
  const out = samples.slice(
    Math.max(0, first * hop - pad),
    Math.min(samples.length, (last + 1) * hop + tail),
  )
  // The last word's decay, faded over the tail rather than cut, so nothing clicks.
  for (let i = 0; i < Math.min(tail, out.length); i += 1) {
    const k = out.length - 1 - i
    out[k] = (out[k] ?? 0) * (i / tail)
  }
  return out
}

/**
 * A whole reading cut into its sentences: at the pauses nearest where each sentence should end,
 * judged from how long each runs when read alone. Undefined when a piece comes out far longer or
 * shorter than its sentence read alone, so a bad cut is never used.
 */
function splitAtPauses(samples: Float32Array, rate: number, alone: number[]) {
  const hop = Math.round(0.01 * rate)
  const levels: number[] = []
  for (let s = 0; s + hop <= samples.length; s += hop) {
    let sum = 0
    for (let i = s; i < s + hop; i += 1) sum += (samples[i] ?? 0) ** 2
    levels.push(Math.sqrt(sum / hop))
  }
  const loud = [...levels].sort((a, b) => a - b)[Math.floor(levels.length * 0.95)] ?? 0.1
  const quiet = loud * 10 ** (-36 / 20)
  // Every pause of 60 ms or more: where it is, and how long.
  const pauses: { mid: number; length: number }[] = []
  for (let i = 0; i < levels.length; ) {
    if ((levels[i] ?? 0) >= quiet) {
      i += 1
      continue
    }
    let j = i
    while (j < levels.length && (levels[j] ?? 0) < quiet) j += 1
    if (j - i >= 6 && i > 0 && j < levels.length)
      pauses.push({ mid: (i + j) / 2 / 100, length: (j - i) / 100 })
    i = j
  }
  const total = samples.length / rate
  const sum = alone.reduce((a, b) => a + b, 0)
  const cuts: number[] = []
  let at = 0
  let before = 0
  for (const [k, seconds] of alone.slice(0, -1).entries()) {
    before += seconds
    const expected = (before / sum) * total
    const next = ((before + (alone[k + 1] ?? 0)) / sum) * total
    const best = pauses
      .filter((p) => p.mid > at + 0.25 && p.mid < next)
      .map((p) => ({ ...p, score: p.length - 0.6 * Math.abs(p.mid - expected) }))
      .sort((a, b) => b.score - a.score)[0]
    if (!best) return undefined
    cuts.push(best.mid)
    at = best.mid
  }
  const bounds = [0, ...cuts, total]
  const pieces = bounds
    .slice(0, -1)
    .map((from, k) =>
      samples.slice(Math.round(from * rate), Math.round((bounds[k + 1] ?? total) * rate)),
    )
  const fits = pieces.every((piece, k) => {
    const ratio = trim(piece, rate).length / rate / (alone[k] ?? 1)
    return ratio > 0.6 && ratio < 1.6
  })
  return fits ? pieces : undefined
}

async function speak() {
  // --scene=a,b re-records only those scenes and keeps every other take.
  const only = process.argv
    .find((arg) => arg.startsWith('--scene='))
    ?.slice('--scene='.length)
    .split(',')
  const file = path.join(ROOT, 'src/data', FILM.file)
  const kept = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { lines: Record<string, Take[]> }).lines
    : {}
  const lines: Record<string, Take[]> = only ? kept : {}
  for (const scene of FILM.scenes.filter((s) => !only || only.includes(s.id))) {
    const dir = path.join(ROOT, 'public/audio/vo', scene.id)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const said: Take[] = []
    const texts = sentences(scene.vo)
    const say = async (text: string) => {
      const audio = await tts.generate(voiced(text), {
        voice: VOICE as 'af_heart',
        speed: FILM.speed,
      })
      return { samples: audio.audio, rate: audio.sampling_rate }
    }
    // Each sentence alone: the takes themselves, or the guide to where a whole reading splits.
    const alone = []
    for (const text of texts) alone.push(await say(text))
    let pieces = alone.map((take) => trim(take.samples, take.rate))
    if (FILM.whole && texts.length > 1) {
      const whole = await say(texts.join(' '))
      const split = splitAtPauses(
        whole.samples,
        whole.rate,
        alone.map((take) => trim(take.samples, take.rate).length / take.rate),
      )
      if (split) pieces = split.map((piece) => trim(piece, whole.rate))
      else console.log(`${scene.id}: the whole reading would not split cleanly; using single takes`)
    }
    const rate = alone[0]?.rate ?? 24_000
    for (const [i, sentence] of texts.entries()) {
      const speech = pieces[i] ?? new Float32Array(0)
      // ffmpeg resamples the model's 24 kHz to 48 kHz stereo; the line is then levelled.
      const raw = path.join(dir, `.${i}.raw.wav`)
      writeFileSync(raw, floatWav(speech, undefined, rate))
      // Then the broadcast chain (EQ, de-esser, compressor), the treatment a studio voiceover gets.
      const voice = broadcastVoice(decode(raw).left, RATE)
      rmSync(raw)
      const gain = 10 ** ((LINE_LUFS - integratedLoudness(voice, voice)) / 20)
      const l = voice.map((v) => v * gain)
      const r = Float32Array.from(l)
      limit(l, r, -3)
      writeFileSync(path.join(dir, `${i}.wav`), floatWav(l, r))
      said.push({ text: sentence, seconds: Math.round((l.length / RATE) * 1000) / 1000 })
      console.log(`${scene.id} ${i}: ${(l.length / RATE).toFixed(2)} s  ${sentence}`)
    }
    lines[scene.id] = said
  }
  // In script order, so the file reads like the script.
  const ordered = Object.fromEntries(
    FILM.scenes.filter((scene) => lines[scene.id]).map((scene) => [scene.id, lines[scene.id]]),
  )
  writeFileSync(
    file,
    `${JSON.stringify({ source: `${MODEL} (${DTYPE}), voice ${VOICE}`, lines: ordered }, null, 2)}\n`,
  )
  console.log(`Wrote public/audio/vo and src/data/${FILM.file}.`)
}
