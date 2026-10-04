/**
 * Saves the share image and the touch icon as PNGs, from the running web app's own pages:
 *   pnpm --filter @shakedown/web dev     # or start
 *   pnpm --filter @shakedown/web og [baseUrl]
 * Uses the Chrome already installed on this machine; nothing is downloaded.
 */
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:3000'
const root = path.resolve(import.meta.dirname, '..')

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await og.goto(`${base}/og-card`, { waitUntil: 'networkidle' })
  // A dev server draws its own indicator over the page; it is not part of the card.
  await og.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await og.evaluate(() => document.fonts.ready)
  await og.locator('.og').screenshot({ path: path.join(root, 'public/og.png') })

  const icon = await browser.newPage({
    viewport: { width: 180, height: 180 },
    deviceScaleFactor: 1,
  })
  await icon.setContent(
    `<body style="margin:0;display:grid;place-items:center;width:180px;height:180px;background:#f4efe6">
      <img src="${base}/icon.svg" width="140" height="140" alt="">
    </body>`,
  )
  await icon.waitForLoadState('networkidle')
  await icon.screenshot({ path: path.join(root, 'app/apple-icon.png') })
  console.log('Saved public/og.png and app/apple-icon.png')
} finally {
  await browser.close()
}
