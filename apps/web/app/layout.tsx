import type { Metadata } from 'next'
import { Bricolage_Grotesque, IBM_Plex_Mono, Public_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  variable: '--font-bricolage',
  display: 'swap',
})
const ui = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Shakedown: customers from hell, in the sandbox',
  description:
    'Sandbox-only QA for PayPal checkouts and AI support agents. Six test customers find what would have leaked, then help you seal it.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${ui.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
