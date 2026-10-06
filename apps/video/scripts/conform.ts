/**
 * Turns each captured take into video the edit can use. Screencast frames arrive only when the
 * page repaints, so each one is held until the next arrives, and the result is encoded at a
 * constant 30 fps with Remotion's own ffmpeg: nothing else needs installing. The take's event
 * log goes beside the video, where the compositions read the cursor and the callouts.
 *
 *   pnpm --filter @shakedown/video conform [take …]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const RAW = path.join(ROOT, 'public/footage/raw')
const OUT = path.join(ROOT, 'public/footage')

interface TakeFile {
  take: string
  shows: string
  durationMs: number
  width: number
  height: number
  scale: number
  frames: { file: string; t: number }[]
  events: unknown[]
}

const wanted = process.argv.slice(2)
const takes = readdirSync(RAW).filter(
  (name) =>
    existsSync(path.join(RAW, name, 'take.json')) && (wanted.length === 0 || wanted.includes(name)),
)
mkdirSync(OUT, { recursive: true })

/** A JPEG's width and height, from its start-of-frame marker. */
function jpegSize(file: string): string {
  const data = readFileSync(file)
  const at = data.indexOf(Buffer.from([0xff, 0xc0]))
  return at < 0 ? '?' : `${data.readUInt16BE(at + 7)}x${data.readUInt16BE(at + 5)}`
}

for (const name of takes) {
  const dir = path.join(RAW, name)
  const take = JSON.parse(readFileSync(path.join(dir, 'take.json'), 'utf8')) as TakeFile
  // The first frame can arrive before the viewport has its size; keep only full-size frames.
  // Full size is the size most frames came in: headless Chrome sends 1080p even at --scale=2.
  const sizes = take.frames.map((frame) => jpegSize(path.join(dir, frame.file)))
  const counts = new Map<string, number>()
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1)
  const size = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?'
  const asked = `${take.width * (take.scale ?? 1)}x${take.height * (take.scale ?? 1)}`
  if (size !== asked) console.log(`${name}: frames came in at ${size}, not the ${asked} asked for.`)
  take.frames = take.frames.filter((_, i) => sizes[i] === size)
  if (take.frames.length === 0) throw new Error(`${name} has no frames.`)
  // Each frame lasts until the next one; the first starts the take, the last runs to its end.
  const lines = ['ffconcat version 1.0']
  take.frames.forEach((frame, i) => {
    const start = i === 0 ? 0 : frame.t
    const end = take.frames[i + 1]?.t ?? take.durationMs
    lines.push(
      `file '${frame.file}'`,
      `duration ${Math.max(0.001, (end - start) / 1000).toFixed(4)}`,
    )
  })
  // The concat demuxer drops the last duration unless the last file is listed once more.
  lines.push(`file '${take.frames.at(-1)?.file}'`)
  writeFileSync(path.join(dir, 'frames.ffconcat'), `${lines.join('\n')}\n`)

  const video = path.join(OUT, `${name}.mp4`)
  execFileSync(
    'pnpm',
    [
      'exec',
      'remotion',
      'ffmpeg',
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      path.join(dir, 'frames.ffconcat'),
      '-r',
      '30',
      '-fps_mode',
      'cfr',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '16',
      '-movflags',
      '+faststart',
      video,
    ],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
  )
  writeFileSync(
    path.join(OUT, `${name}.json`),
    `${JSON.stringify({ take: take.take, shows: take.shows, durationMs: take.durationMs, width: take.width, height: take.height, events: take.events }, null, 1)}\n`,
  )
  console.log(`${name}: ${path.relative(ROOT, video)} (${(take.durationMs / 1000).toFixed(1)} s)`)
}
