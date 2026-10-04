import Link from 'next/link'
import { Logo } from '../_components/logo'
import { ThemeToggle } from '../_components/theme-toggle'

// Render is named only where it is true: in a build that Render itself ran.
const ON_RENDER = Boolean(process.env.RENDER)

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div>
          <Logo size={24} />
          <p className="site-footer__tagline">Customers from hell. Sandbox only.</p>
        </div>
        <nav aria-label="Footer" className="site-footer__links">
          <div>
            <p className="label">Product</p>
            <Link href="/#demo">Demo</Link>
            <Link href="/app">Console</Link>
            <Link href="/docs#cli">CLI</Link>
            <Link href="/docs#ci">CI</Link>
            <Link href="/docs">Docs</Link>
          </div>
          <div>
            <p className="label">Project</p>
            <Link href="/#judges">For judges</Link>
            <Link href="/#responsible-use">Responsible use</Link>
            <Link href="/#how-it-decides">How it decides</Link>
          </div>
        </nav>
        <ThemeToggle />
      </div>
      <p className="site-footer__built">
        Console built with AG Studio by AG Grid
        {ON_RENDER ? ' · Hosted on Render, with durable runs on Render Workflows' : ''} · Payments
        tested against the PayPal sandbox REST APIs: Orders v2, Payments v2, Webhooks.
      </p>
      <p className="site-footer__legal">
        Shakedown is an independent project created for the PayPal AI Hackathon. It is not
        affiliated with, sponsored by or endorsed by PayPal, AG Grid{ON_RENDER ? ' or Render' : ''}.
        PayPal is a trademark of PayPal, Inc. AG Grid is a trademark of AG Grid Ltd. Other names are
        the property of their respective owners. © 2026 Shakedown contributors · Apache-2.0
      </p>
    </footer>
  )
}
