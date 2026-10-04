import Link from 'next/link'
import { Logo } from '../_components/logo'
import { ThemeToggle } from '../_components/theme-toggle'

const NAV = [
  { href: '/#cast', label: 'Cast' },
  { href: '/#how', label: 'How it works' },
  { href: '/#demo', label: 'Demo' },
  { href: '/docs', label: 'Docs' },
]

export function SiteHeader() {
  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <Link href="/" className="site-header__home" aria-label="Shakedown, home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="site-nav">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="site-header__actions">
            <Link href="/#judges" className="judge-chip">
              Judging? 2-min tour
            </Link>
            <Link href="/#demo" className="btn btn-primary">
              Run the demo
            </Link>
            <details className="site-menu">
              <summary aria-label="Menu">
                <span aria-hidden="true">≡</span>
              </summary>
              <div className="site-menu__panel">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
                <Link href="/#judges">Judging? 2-min tour</Link>
                <Link href="/app">Open the console</Link>
                <ThemeToggle />
              </div>
            </details>
          </div>
        </div>
      </header>
      {/* Phones: under the header, and it scrolls away with the page. */}
      <Link href="/#judges" className="judge-row">
        Judging? Take the 2-minute tour →
      </Link>
    </>
  )
}
