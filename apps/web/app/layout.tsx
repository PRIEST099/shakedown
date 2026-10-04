import type { Metadata } from 'next'
import { IBM_Plex_Mono, Public_Sans } from 'next/font/google'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import './globals.css'

// One instance of Bricolage Grotesque: weight 800 at optical size 96, width 75–100 (_fonts/README.md).
const bricolage = localFont({
  src: './_fonts/bricolage-grotesque-display.woff2',
  weight: '800',
  style: 'normal',
  declarations: [{ prop: 'font-stretch', value: '75% 100%' }],
  variable: '--font-bricolage',
  display: 'swap',
  adjustFontFallback: 'Arial',
})
const ui = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

// Share images need absolute URLs; Render sets RENDER_EXTERNAL_URL on its services.
const SITE_URL =
  process.env.SHAKEDOWN_SITE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Shakedown: customers from hell, in the sandbox',
  description:
    'Sandbox-only QA for PayPal checkouts and AI support agents. Six test customers find what would have leaked, then help you seal it.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${ui.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
