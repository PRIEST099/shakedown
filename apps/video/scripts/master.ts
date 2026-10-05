/**
 * Masters a render's audio to the platform level (VIDEO_PIPELINE §4.5): −14 LUFS integrated, true
 * peak at or under −1.5 dBTP. The picture is copied untouched; only the sound is replaced.
 *
 *   pnpm --filter @shakedown/video master out/shakedown-teaser.mp4 [out/other.mp4 …]
 *
 * The limiter holds the true peak (4× oversampled) 0.5 dB under the target, room for the AAC
 * encoder's overshoot. ffmpeg's own meter checks the encoded result, and a file that misses the
 * target is left as it was.
 */
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { integratedLoudness, master, samplePeak } from './loudness'
import { decode, ffmpeg, floatWav } from './wav'

const TARGET = { lufs: -14, ceilingDb: -2.0 }
const TRUE_PEAK_LIMIT = -1.5

/** ffmpeg's own measurement of a file: integrated loudness and true peak. */
function measure(file: string) {
  const report = ffmpeg([
    '-i',
    file,
    '-vn',
    '-af',
    'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
    '-f',
    'null',
    '-',
  ]).stderr.toString()
  const json = /\{[^{}]*"input_i"[^{}]*\}/s.exec(report)?.[0]
  if (!json) throw new Error(`No loudness reading for ${file}.`)
  const m = JSON.parse(json) as Record<string, string>
  return { lufs: Number(m.input_i), truePeak: Number(m.input_tp) }
}

for (const file of process.argv.slice(2)) {
  const before = decode(file)
  const was = integratedLoudness(before.left, before.right)
  const done = master(before.left, before.right, TARGET)
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.master.wav`)
  const out = path.join(path.dirname(file), `.${path.basename(file)}.mastered.mp4`)
  writeFileSync(temp, floatWav(done.left, done.right))
  ffmpeg([
    '-y',
    '-i',
    file,
    '-i',
    temp,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '320k',
    '-movflags',
    '+faststart',
    out,
  ])
  rmSync(temp)
  const check = measure(out)
  if (check.truePeak > TRUE_PEAK_LIMIT || Math.abs(check.lufs - TARGET.lufs) > 0.5) {
    rmSync(out)
    throw new Error(
      `${file}: mastered to ${check.lufs} LUFS, ${check.truePeak} dBTP, outside the target. Left unchanged.`,
    )
  }
  renameSync(out, file)
  console.log(
    `${file}: ${was.toFixed(1)} → ${check.lufs.toFixed(1)} LUFS, true peak ${check.truePeak.toFixed(1)} dBTP (samples ${samplePeak(done.left, done.right).toFixed(1)} dBFS).`,
  )
}
