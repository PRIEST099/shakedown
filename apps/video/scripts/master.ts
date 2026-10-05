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
import { spawnSync } from 'node:child_process'
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { integratedLoudness, master, samplePeak } from './loudness'

const RATE = 48_000
const TARGET = { lufs: -14, ceilingDb: -2.0 }
const TRUE_PEAK_LIMIT = -1.5

function ffmpeg(args: string[], maxBuffer = 16 * 1024 * 1024) {
  const run = spawnSync(
    'pnpm',
    ['exec', 'remotion', 'ffmpeg', '-hide_banner', '-nostats', ...args],
    {
      maxBuffer,
    },
  )
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.toString()}`)
  return run
}

/**
 * The file's audio as 48 kHz stereo floats. Remotion's ffmpeg writes no raw float format, so it
 * hands over a 24-bit WAV, read here chunk by chunk.
 */
function decode(file: string) {
  const bytes = ffmpeg(
    ['-i', file, '-vn', '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s24le', '-f', 'wav', '-'],
    1024 * 1024 * 1024,
  ).stdout
  // pnpm's wrapper can print a few bytes before ffmpeg's own output: start at the signature.
  let offset = bytes.indexOf('RIFF') + 12
  while (offset + 8 <= bytes.length && bytes.toString('ascii', offset, offset + 4) !== 'data') {
    const size = bytes.readUInt32LE(offset + 4)
    offset += 8 + size + (size % 2)
  }
  // Written to a pipe, the data chunk's size isn't filled in: it runs to the end.
  offset += 8
  const frames = Math.floor((bytes.length - offset) / 6)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  for (let i = 0; i < frames; i += 1) {
    left[i] = bytes.readIntLE(offset + i * 6, 3) / 8_388_608
    right[i] = bytes.readIntLE(offset + i * 6 + 3, 3) / 8_388_608
  }
  return { left, right }
}

/** A 32-bit float stereo WAV. */
function wav(left: Float32Array, right: Float32Array) {
  const n = left.length
  const out = Buffer.alloc(44 + n * 8)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + n * 8, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(3, 20)
  out.writeUInt16LE(2, 22)
  out.writeUInt32LE(RATE, 24)
  out.writeUInt32LE(RATE * 8, 28)
  out.writeUInt16LE(8, 32)
  out.writeUInt16LE(32, 34)
  out.write('data', 36)
  out.writeUInt32LE(n * 8, 40)
  for (let i = 0; i < n; i += 1) {
    out.writeFloatLE(left[i] ?? 0, 44 + i * 8)
    out.writeFloatLE(right[i] ?? 0, 48 + i * 8)
  }
  return out
}

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
  writeFileSync(temp, wav(done.left, done.right))
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
