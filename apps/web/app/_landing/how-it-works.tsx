import { KeyRound, Receipt, Stamp, Users } from 'lucide-react'

const STEPS = [
  {
    icon: KeyRound,
    title: 'Connect',
    body: 'Point Shakedown at your store with your PayPal sandbox app’s credentials. Live credentials and live PayPal hosts are refused before anything runs.',
  },
  {
    icon: Users,
    title: 'Cast',
    body: 'Pick your customers from hell. Each one runs a scripted scenario against your checkout, your webhook listener or your support assistant.',
  },
  {
    icon: Receipt,
    title: 'Receipt',
    body: 'Every finding becomes a line item: what the customer did, the PayPal sandbox IDs that prove it, and what it would have cost.',
  },
  {
    icon: Stamp,
    title: 'Seal',
    body: 'Apply the fix, re-run with the same seed, and keep the run in CI, so the leak can’t come back.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="section" aria-labelledby="how-title">
      <p className="label">How it works</p>
      <h2 id="how-title" className="display-l section__title">
        How a shakedown runs
      </h2>
      <ol className="steps">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="step">
            <span className="step__no">{index + 1}</span>
            <Icon aria-hidden="true" size={22} strokeWidth={1.75} className="step__icon" />
            <h3 className="step__title">{title}</h3>
            <p className="step__body">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
