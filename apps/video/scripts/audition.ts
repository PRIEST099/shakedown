/**
 * A voice audition for the walkthrough: the same lines in each candidate voice, through the
 * broadcast chain, next to the current take as it is. Listen, pick, then voice the film.
 *
 *   pnpm --filter @shakedown/video exec tsx scripts/audition.ts
 *
 * Writes out/audition/<n>-<voice>.wav, 48 kHz, each at −16 LUFS so none wins by being louder.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KokoroTTS } from 'kokoro-js'
import { voiced } from '../src/spoken'
import { integratedLoudness, limit } from './loudness'
import { broadcastVoice } from './voice-chain'
import { decode, floatWav, RATE } from './wav'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'out/audition')
const LINES = [
  'Let me show you a problem that hides in a lot of PayPal checkouts.',
  "Here's my shop's order list: two orders, $24 each, for one checkout.",
  'A normal test won’t catch leaks like these, because test customers behave. So I built Shakedown.',
]
const TAKES: { name: string; voice: string; speed: number; chain: boolean }[] = [
  { name: '0-current-fenrir-raw', voice: 'am_fenrir', speed: 0.94, chain: false },
  { name: '1-fenrir', voice: 'am_fenrir', speed: 0.94, chain: true },
  { name: '2-michael', voice: 'am_michael', speed: 0.96, chain: true },
  { name: '3-puck', voice: 'am_puck', speed: 0.96, chain: true },
  { name: '4-george-british', voice: 'bm_george', speed: 0.96, chain: true },
  { name: '5-fable-british', voice: 'bm_fable', speed: 0.96, chain: true },
  { name: '6-heart-female', voice: 'af_heart', speed: 1, chain: true },
]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'fp32',
  device: 'cpu',
})
for (const take of TAKES) {
  // One reading of all three lines, so the pauses between them are the voice's own.
  const audio = await tts.generate(voiced(LINES.join(' ')), {
    voice: take.voice as 'af_heart',
    speed: take.speed,
  })
  const raw = path.join(OUT, `.${take.name}.raw.wav`)
  writeFileSync(raw, floatWav(audio.audio, undefined, audio.sampling_rate))
  const { left } = decode(raw)
  rmSync(raw)
  const mono = take.chain ? broadcastVoice(left, RATE) : left
  const gain = 10 ** ((-16 - integratedLoudness(mono, mono)) / 20)
  const l = mono.map((v) => v * gain)
  const r = Float32Array.from(l)
  limit(l, r, -3)
  writeFileSync(path.join(OUT, `${take.name}.wav`), floatWav(l, r))
  console.log(`${take.name}: ${(l.length / RATE).toFixed(1)} s`)
}
await tts.model.dispose()
console.log(`Wrote ${OUT}`)
