/**
 * Renders the Devpost gallery (src/Gallery.tsx) to out/gallery/NN-<name>.png, 3000×2000 each and
 * numbered in the order to upload them. Take fresh screenshots first with `gallery:shots`.
 *
 *   pnpm --filter @shakedown/video gallery
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { SLIDES } from '../src/gallery-slides'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'out/gallery')
const FRAMES = path.join(OUT, 'frames')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })
execFileSync(
  'pnpm',
  [
    'exec',
    'remotion',
    'render',
    'src/index.ts',
    'Gallery',
    FRAMES,
    '--sequence',
    '--image-format=png',
    '--scale=2',
    '--image-sequence-pattern=[frame].[ext]',
  ],
  { cwd: ROOT, stdio: 'inherit' },
)
// One frame per slide: frame n becomes slide n + 1, named after it.
for (const file of readdirSync(FRAMES)) {
  const frame = Number(file.match(/^(\d+)\.png$/)?.[1])
  const slide = SLIDES[frame]
  if (!slide) continue
  const name = `${String(frame + 1).padStart(2, '0')}-${slide.name}.png`
  renameSync(path.join(FRAMES, file), path.join(OUT, name))
}
rmSync(FRAMES, { recursive: true, force: true })
console.log(`Wrote ${SLIDES.length} slides to out/gallery.`)
