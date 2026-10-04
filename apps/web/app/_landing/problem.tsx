import { MessagesSquare, ShoppingCart, Wrench } from 'lucide-react'

const CARDS = [
  {
    icon: MessagesSquare,
    stat: '50 of 55',
    body: 'AI customer-service agents in an independent test offered incentives they weren’t authorized to give.',
    source: {
      label: 'General Analysis, 2026',
      href: 'https://generalanalysis.com/blog/adversarial-analysis-customer-service-agents',
    },
  },
  {
    icon: ShoppingCart,
    stat: 'Marked paid, wrong amount',
    body: 'A published bug class in a PayPal plugin: an order changed after approval was still treated as fully paid.',
    source: { label: 'CVE-2025-29788', href: 'https://github.com/advisories/GHSA-pqq3-q84h-pj6x' },
  },
  {
    icon: Wrench,
    stat: '3 open issues',
    body: 'PayPal’s open-source Agent Toolkit tracks open issues about capture with no human gate and about missing idempotency on orders.',
    source: {
      label: 'agent-toolkit #95, #82, #98',
      href: 'https://github.com/paypal/agent-toolkit/issues/95',
    },
  },
]

export function Problem() {
  return (
    <section className="section" aria-labelledby="problem-title">
      <p className="label">The problem</p>
      <h2 id="problem-title" className="display-l section__title">
        Every test passed. It still leaked.
      </h2>
      <p className="section__lede">
        Unit tests walk the happy path. Real customers don’t. They click Pay twice, change the cart
        after approving, and talk your support bot into refunds your policy never allowed. None of
        that throws an error. It just costs money.
      </p>
      <ul className="problem-grid">
        {CARDS.map(({ icon: Icon, stat, body, source }) => (
          <li key={stat} className="problem-card">
            <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
            <p className="problem-card__stat">{stat}</p>
            <p className="problem-card__body">{body}</p>
            <a className="problem-card__source" href={source.href} rel="noreferrer" target="_blank">
              {source.label} ↗
            </a>
          </li>
        ))}
      </ul>
      <p className="section__close">
        Shakedown finds these before launch, in the sandbox, with receipts. The leaks are in
        integrations; PayPal’s sandbox is where they show up safely.
      </p>
    </section>
  )
}
