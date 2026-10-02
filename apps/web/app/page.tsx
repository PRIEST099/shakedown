import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28">
      <p className="label">
        Sandbox-only QA for <span className="mark-paypal">PayPal</span> checkouts and AI support
        agents
      </p>
      <h1 className="display-xl mt-4 max-w-[14ch]">
        Meet your <span className="swipe">customers from hell.</span> In the sandbox.
      </h1>
      <p className="mt-6 max-w-[60ch] text-lg text-muted">
        Six test customers run your own PayPal sandbox checkout and AI support agent. You get a
        receipt for every dollar that would have leaked, read from PayPal’s sandbox ledger, plus the
        fix. Shakedown is being built right now.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/preview" className="btn btn-primary">
          See the design preview
        </Link>
      </div>
      <p className="mt-16 text-sm text-subtle">
        Shakedown is an independent project and is not affiliated with or endorsed by PayPal.
      </p>
    </main>
  )
}
