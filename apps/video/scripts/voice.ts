/**
 * The scratch voiceover (VIDEO_PIPELINE §4.2): each sentence of the script read by Kokoro-82M, an
 * open-weight speech model (Apache-2.0) run locally, so the animatic can be timed to real speech
 * before you record your own voice. Never macOS system voices.
 *
 *   pnpm --filter @shakedown/video voice                 # every line
 *   pnpm --filter @shakedown/video voice --scene=proof   # one scene's lines, keeping the rest
 *   pnpm --filter @shakedown/video voice --probe "the AI" "in CI"   # the phonemes it would say
 *
 * The first run downloads the model (about 330 MB) from Hugging Face into the transformers.js
 * cache under node_modules. It writes public/audio/vo/<scene>/<n>.wav, 48 kHz with each line at
 * about −16 LUFS, and src/data/vo.json, each line's text and length, which the cut is timed from.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KokoroTTS, TextSplitterStream } from 'kokoro-js'
import { SCENES, sentences } from '../src/script'
import { voiced } from '../src/spoken'
import { integratedLoudness, limit } from './loudness'
import { decode, floatWav, RATE } from './wav'

const ROOT = path.resolve(import.meta.dirname, '..')
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const DTYPE = 'fp32'
const VOICE = 'af_heart'
const LINE_LUFS = -16

/** One recorded line: the sentence as written, and how long the take runs. */
type Take = { text: string; seconds: number }

const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' })

if (process.argv.includes('--probe')) {
  for (const text of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
    const splitter = new TextSplitterStream()
    const stream = tts.stream(splitter)
    splitter.push(voiced(text))
    splitter.close()
    for await (const chunk of stream) console.log(`${text}  →  ${chunk.phonemes}`)
  }
} else {
  await speak()
}
// Release the ONNX session before exit: tearing it down mid-exit aborts the process.
await tts.model.dispose()

/** The speech without the silence the model leaves around it, plus 40 ms either side. */
function trim(samples: Float32Array, rate: number) {
  const floor = 10 ** (-50 / 20)
  let start = 0
  let end = samples.length - 1
  while (start < end && Math.abs(samples[start] ?? 0) < floor) start += 1
  while (end > start && Math.abs(samples[end] ?? 0) < floor) end -= 1
  const pad = Math.round(0.04 * rate)
  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad))
}

async function speak() {
  // --scene=a,b re-records only those scenes and keeps every other take.
  const only = process.argv
    .find((arg) => arg.startsWith('--scene='))
    ?.slice('--scene='.length)
    .split(',')
  const file = path.join(ROOT, 'src/data/vo.json')
  const kept = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { lines: Record<string, Take[]> }).lines
    : {}
  const lines: Record<string, Take[]> = only ? kept : {}
  for (const scene of SCENES.filter((s) => !only || only.includes(s.id))) {
    const dir = path.join(ROOT, 'public/audio/vo', scene.id)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const said: Take[] = []
    for (const [i, sentence] of sentences(scene.vo).entries()) {
      const audio = await tts.generate(voiced(sentence), { voice: VOICE })
      const speech = trim(audio.audio, audio.sampling_rate)
      // ffmpeg resamples the model's 24 kHz to 48 kHz stereo; the line is then levelled.
      const raw = path.join(dir, `.${i}.raw.wav`)
      writeFileSync(raw, floatWav(speech, undefined, audio.sampling_rate))
      const { left, right } = decode(raw)
      rmSync(raw)
      const gain = 10 ** ((LINE_LUFS - integratedLoudness(left, right)) / 20)
      const l = left.map((v) => v * gain)
      const r = right.map((v) => v * gain)
      limit(l, r, -3)
      writeFileSync(path.join(dir, `${i}.wav`), floatWav(l, r))
      said.push({ text: sentence, seconds: Math.round((l.length / RATE) * 1000) / 1000 })
      console.log(`${scene.id} ${i}: ${(l.length / RATE).toFixed(2)} s  ${sentence}`)
    }
    lines[scene.id] = said
  }
  // In script order, so the file reads like the script.
  const ordered = Object.fromEntries(
    SCENES.filter((scene) => lines[scene.id]).map((scene) => [scene.id, lines[scene.id]]),
  )
  writeFileSync(
    file,
    `${JSON.stringify({ source: `${MODEL} (${DTYPE}), voice ${VOICE}`, lines: ordered }, null, 2)}\n`,
  )
  console.log('Wrote public/audio/vo and src/data/vo.json.')
}
