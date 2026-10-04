import Link from 'next/link'

const STEPS = [
  { what: 'Open the console. No sign-up.', when: '0:00', href: '/app' },
  {
    what: 'Run leaky, and watch the receipt go red as each leak lands.',
    when: '0:15',
    href: '/app',
  },
  {
    what: 'Click a leak: the finding shows the PayPal sandbox IDs that prove it.',
    when: '1:00',
    href: '/app',
  },
  { what: 'Run sealed: the same customers, $0.00, stamped SEALED.', when: '1:30', href: '/app' },
  { what: 'Ask Triage which customer leaked most.', when: '1:50', href: '/app' },
]

export function Judges() {
  return (
    <section id="judges" className="section judges" aria-labelledby="judges-title">
      <div>
        <p className="label">For judges</p>
        <h2 id="judges-title" className="display-l section__title">
          Judging? Here’s the two-minute tour.
        </h2>
        <ol className="tour">
          {STEPS.map((step, index) => (
            <li key={step.when} className="tour__item">
              <span className="tour__no">{index + 1}</span>
              <span className="tour__what">{step.what}</span>
              <span className="tour__when">{step.when}</span>
            </li>
          ))}
        </ol>
        <Link href="/app" className="btn btn-primary btn-lg">
          Start the tour →
        </Link>
      </div>
      <aside className="whats-real" aria-label="What's real">
        <p className="label">What’s real</p>
        <p>
          <strong>Real:</strong> PayPal sandbox orders, captures, refunds and card declines, the
          webhooks Shakedown sends, and every amount on the scoreboard.
        </p>
        <p>
          <strong>Recorded:</strong> the receipt at the top of this page and the runs the console
          opens with, each labelled as a recording with its date.
        </p>
        <p>
          <strong>Live:</strong> any run you start, labelled Live while it prints.
        </p>
      </aside>
    </section>
  )
}
