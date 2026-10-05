/**
 * Contact sheets for reviewing a render: stills at the given seconds, four to a sheet, each
 * stamped with its time (VIDEO_PIPELINE §8, QA). Landscape renders tile two by two; with
 * --portrait (the vertical teaser), four across.
 *
 *   pnpm --filter @shakedown/video sheet out/shakedown-animatic.mp4 <out-dir> 1.0 3.5 …
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const portrait = process.argv.includes('--portrait')
const [video, outDir, ...times] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const cell = portrait ? 470 : 960
const columns = portrait ? 4 : 2
if (!video || !outDir) throw new Error('usage: sheet <video> <outDir> <seconds…>')
const stills: { t: string; file: string }[] = []
for (const t of times) {
  const file = path.join(outDir, `still-${t}.jpg`)
  execFileSync(
    'pnpm',
    [
      'exec',
      'remotion',
      'ffmpeg',
      '-y',
      '-loglevel',
      'error',
      '-ss',
      t,
      '-i',
      video,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      file,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
  stills.push({ t, file })
}
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: columns * cell + 20, height: 1100 } })
for (let i = 0; i < stills.length; i += 4) {
  const group = stills.slice(i, i + 4)
  const cells = group
    .map(
      ({ t, file }) =>
        `<figure><img src="data:image/jpeg;base64,${readFileSync(file).toString('base64')}"><figcaption>${Number(t).toFixed(1)} s</figcaption></figure>`,
    )
    .join('')
  await page.setContent(
    `<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${columns},${cell}px);gap:20px 6px}figure{margin:0;position:relative}img{width:${cell}px;display:block}figcaption{position:absolute;right:6px;top:6px;background:#ffe14d;font:700 22px system-ui;padding:2px 8px}</style>${cells}`,
  )
  await page.waitForTimeout(150)
  await page.screenshot({ path: path.join(outDir, `sheet-${i / 4 + 1}.png`), fullPage: true })
}
await browser.close()
console.log(`${Math.ceil(stills.length / 4)} sheets in ${outDir}`)
