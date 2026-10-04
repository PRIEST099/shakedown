import Link from 'next/link'

export const metadata = { title: 'Not found · Leaky Llama Supply Co.' }

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-line bg-paper p-8 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-clay">404 · OFF THE TRAIL</p>
      <h1 className="mt-2 text-3xl font-semibold">We can’t find that page.</h1>
      <p className="mt-3 text-stone">
        The link may be old, or the order number mistyped. Your orders from this browser are on the
        orders page.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-moss px-5 py-2.5 font-semibold text-sand hover:bg-moss-dark"
        >
          Back to the shop
        </Link>
        <Link
          href="/orders"
          className="rounded-full border border-line px-5 py-2.5 font-semibold hover:border-moss"
        >
          Your orders
        </Link>
      </div>
    </section>
  )
}
