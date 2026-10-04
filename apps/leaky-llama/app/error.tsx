'use client'

import Link from 'next/link'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-line bg-paper p-8 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-clay">
        SOMETHING SLIPPED{error.digest ? ` · REF ${error.digest}` : ''}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">That didn’t load.</h1>
      <p className="mt-3 text-stone">
        Something on our side isn’t answering. Try again in a moment.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-moss px-5 py-2.5 font-semibold text-sand hover:bg-moss-dark"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-line px-5 py-2.5 font-semibold hover:border-moss"
        >
          Back to the shop
        </Link>
      </div>
    </section>
  )
}
