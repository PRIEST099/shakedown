import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from './_landing/site-footer'
import { SiteHeader } from './_landing/site-header'
import './_components/site.css'
import './status-page.css'

export const metadata: Metadata = { title: 'Not found · Shakedown', robots: { index: false } }

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="status-page">
        <div className="status-slip">
          <p className="status-slip__header">Shakedown · lookup</p>
          <p className="status-slip__meta">404 · nothing at this address</p>
          <hr />
          <h1 className="display-l">This page isn’t on the receipt.</h1>
          <p>The link may be old, or the address mistyped.</p>
          <div className="status-slip__links">
            <Link href="/" className="btn btn-primary">
              Back to the start
            </Link>
            <Link href="/docs" className="btn btn-ghost">
              Docs
            </Link>
            <Link href="/app" className="btn btn-ghost">
              Console
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
