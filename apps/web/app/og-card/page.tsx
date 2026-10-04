import { formatCents, Tape } from '@shakedown/ui'
import type { Metadata } from 'next'
import { goldenRun } from '../../lib/golden-run'
import { Mark } from '../_components/logo'
import './og-card.css'

export const metadata: Metadata = { title: 'Share card · Shakedown', robots: { index: false } }
export const dynamic = 'force-static'

/** The 1200×630 share image, rendered from the real components. `pnpm og` saves it as a PNG. */
export default function OgCard() {
  const run = goldenRun()
  const leaked = run.before.reduce((sum, line) => sum + line.amountCents, 0)
  return (
    <div className="og" data-theme="light">
      <div className="og__copy">
        <p className="og__brand">
          <Mark size={64} />
          shakedown
        </p>
        <p className="og__tagline">Customers from hell. Sandbox only.</p>
        <p className="og__sub">
          Test customers for your own PayPal sandbox checkout. A receipt for every dollar that would
          have leaked, read from PayPal’s sandbox ledger.
        </p>
      </div>
      <div className="og__tape">
        <p className="og__was">
          Would have leaked <s>{formatCents(leaked)}</s>
        </p>
        <Tape
          meta={`Recorded sandbox run · ${run.store}`}
          lines={run.after.slice(0, 3)}
          total={{ fromCents: leaked, toCents: 0, progress: 1 }}
          tone="sealed"
          stamp={{ text: 'SEALED', progress: 1 }}
        />
      </div>
    </div>
  )
}
