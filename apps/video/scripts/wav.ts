/**
 * Audio files in and out of Remotion's ffmpeg, which reads float WAVs but writes only 16- and
 * 24-bit PCM, and no raw float format.
 */
import { spawnSync } from 'node:child_process'

export const RATE = 48_000

/** Remotion's own ffmpeg. Its reports (loudnorm's among them) come back on stderr. */
export function ffmpeg(args: string[], maxBuffer = 16 * 1024 * 1024) {
  const run = spawnSync(
    'pnpm',
    ['exec', 'remotion', 'ffmpeg', '-hide_banner', '-nostats', ...args],
    { maxBuffer },
  )
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.toString()}`)
  return run
}

/**
 * Any audio ffmpeg can read, as 48 kHz stereo floats: it hands over a 24-bit WAV, read here chunk
 * by chunk.
 */
export function decode(file: string) {
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

/** A 32-bit float WAV: mono when only `left` is given, stereo otherwise. */
export function floatWav(left: Float32Array, right?: Float32Array, rate = RATE) {
  const channels = right ? 2 : 1
  const n = left.length
  const out = Buffer.alloc(44 + n * 4 * channels)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + n * 4 * channels, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(3, 20)
  out.writeUInt16LE(channels, 22)
  out.writeUInt32LE(rate, 24)
  out.writeUInt32LE(rate * 4 * channels, 28)
  out.writeUInt16LE(4 * channels, 32)
  out.writeUInt16LE(32, 34)
  out.write('data', 36)
  out.writeUInt32LE(n * 4 * channels, 40)
  for (let i = 0; i < n; i += 1) {
    out.writeFloatLE(left[i] ?? 0, 44 + i * 4 * channels)
    if (right) out.writeFloatLE(right[i] ?? 0, 48 + i * 8)
  }
  return out
}
