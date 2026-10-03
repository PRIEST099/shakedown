import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CartLink } from '@/components/CartLink'
import { CartProvider } from '@/components/CartProvider'
import { DemoControls } from '@/components/DemoControls'
import { LlamaMark } from '@/components/LlamaMark'
import { decodeMode, MODE_COOKIE } from '@/lib/mode'
import './globals.css'

export const metadata: Metadata = {
  title: 'Leaky Llama Supply Co. (demo store)',
  description: 'A deliberately leaky demo store for testing with Shakedown. PayPal sandbox only.',
  robots: { index: false },
}

const NAV = [
  { href: '/', label: 'Shop' },
  { href: '/orders', label: 'Your orders' },
  { href: '/policy', label: 'Refund policy' },
  { href: '/support', label: 'Help' },
]

export default async function RootLayout({ children }: { children: ReactNode }) {
  const mode = decodeMode((await cookies()).get(MODE_COOKIE)?.value)
  return (
    <html lang="en">
      <body className="min-h-screen">
        <CartProvider>
          <DemoControls initial={mode} />
          <header className="border-b border-line bg-paper/70">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <Link href="/" className="flex items-center gap-3">
                <LlamaMark />
                <span className="font-display text-xl font-semibold leading-tight">
                  Leaky Llama
                  <span className="block font-sans text-[11px] font-medium tracking-[0.18em] text-stone">
                    SUPPLY CO.
                  </span>
                </span>
              </Link>
              <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-3 py-2 text-ink/80 hover:bg-sand hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
                <CartLink />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
          <footer className="border-t border-line">
            <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-stone sm:px-6">
              Leaky Llama Supply Co. is a demo store written with common integration mistakes, so
              Shakedown has something to test. Every payment is in the PayPal sandbox; nothing
              ships.
            </p>
          </footer>
        </CartProvider>
      </body>
    </html>
  )
}
