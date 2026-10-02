import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Leaky Llama Supply Co. (demo store)',
  description: 'A deliberately leaky demo store for Shakedown. PayPal sandbox only.',
  robots: { index: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
