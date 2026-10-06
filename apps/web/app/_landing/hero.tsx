import { CAST } from '@shakedown/core/cast'
import type { RunFixture } from '@shakedown/ui'
import Link from 'next/link'
import { CopyButton } from '../_components/copy-button'
import { HeroTape, RunDemoButton } from './hero-tape'

const INSTALL = 'npx @shakedown-dev/cli run'

/** The hero. The copy is server-rendered; the receipt animates on the client (hero-tape.tsx). */
export function Hero({ run }: { run: RunFixture & { recordedOn: string } }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="label">
          Sandbox-only QA for <span className="mark-paypal">PayPal</span> checkouts and AI support
          agents
        </p>
        <h1 id="hero-title" className="display-xl hero__title">
          Meet your <span className="swipe">customers from hell.</span> In the sandbox.
        </h1>
        <p className="hero__sub">
          <span className="hero__sub-long">
            Five test customers run your own PayPal sandbox checkout and AI support agent. They
            double-click, swap carts, replay webhooks and argue your refund policy. You get a
            receipt for every dollar that would have leaked, read from PayPal’s sandbox ledger, plus
            the fix.
          </span>
          <span className="hero__sub-short">
            Five test customers run your own PayPal sandbox checkout. You get a receipt for every
            dollar that would have leaked, plus the fix.
          </span>
        </p>
        <div className="hero__ctas">
          <RunDemoButton />
          <Link href="/app" className="btn btn-ghost btn-lg">
            Open the console
          </Link>
        </div>
        <div className="install-chip">
          <code>
            <span aria-hidden="true">$ </span>
            {INSTALL}
          </code>
          <CopyButton text={INSTALL} />
        </div>
        <p className="hero__trust">
          Sandbox only · Your own credentials · PayPal’s ledger keeps the score
        </p>
      </div>

      <HeroTape run={run} />

      <div className="hero__ticker">
        <ul aria-label="The cast">
          {CAST.map((persona) => (
            <li key={persona.id}>
              <a href="#cast">
                <span className="hero__ticker-no">{String(persona.number).padStart(2, '0')}</span>
                {persona.shortName}
              </a>
            </li>
          ))}
        </ul>
        <a href="#cast" className="hero__ticker-more">
          Meet the regulars ↓
        </a>
      </div>
    </section>
  )
}
