import { FileCheck, Gauge, Info, KeyRound, Lock, UserRoundX } from 'lucide-react'
import Link from 'next/link'

const RULES = [
  {
    icon: Lock,
    title: 'Sandbox only',
    body: 'Shakedown refuses live PayPal API hosts and live credentials. There’s no switch to turn that off.',
  },
  {
    icon: KeyRound,
    title: 'Your integration only',
    body: 'Runs use your own sandbox app credentials, and a store must be local or prove it’s yours by serving your verification token.',
  },
  {
    icon: UserRoundX,
    title: 'Fictional customers',
    body: 'The cast are scripted test characters using PayPal sandbox accounts and PayPal’s published test cards. No real people, cards or money.',
  },
  {
    icon: Gauge,
    title: 'Bounded by design',
    body: 'Every campaign has a request and time budget, AI calls have a hard spending cap, and every exchange is kept in the ledger.',
  },
  {
    icon: FileCheck,
    title: 'Outcomes, not playbooks',
    body: 'Findings show what would have leaked and how to fix it, with the evidence. They are not reusable scripts.',
  },
  {
    icon: Info,
    title: 'Independent project',
    body: 'Shakedown isn’t affiliated with or endorsed by PayPal.',
  },
]

export function ResponsibleUse() {
  return (
    <section id="responsible-use" className="section" aria-labelledby="responsible-title">
      <p className="label">Responsible use</p>
      <h2 id="responsible-title" className="display-l section__title">
        Built to be pointed at yourself.
      </h2>
      <div className="rules-layout">
        <ul className="rules">
          {RULES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rule">
              <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
              <div>
                <h3 className="rule__title">{title}</h3>
                <p className="rule__body">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <aside className="name-note" aria-label="About the name">
          <p className="label">About the name</p>
          <p>
            A <em>shakedown cruise</em> is a ship’s test voyage before it enters service. This one
            is for your checkout.
          </p>
          <Link href="/docs#responsible-use">How each rule is enforced →</Link>
        </aside>
      </div>
    </section>
  )
}
