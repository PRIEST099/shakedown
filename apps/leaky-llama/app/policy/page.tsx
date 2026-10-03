import Link from 'next/link'
import { POLICY_SECTIONS } from '@/lib/policy'

export const metadata = { title: 'Refund policy · Leaky Llama Supply Co.' }

export default function PolicyPage() {
  return (
    <article className="max-w-2xl">
      <p className="font-mono text-xs tracking-[0.2em] text-clay">THE SMALL PRINT, MADE BIG</p>
      <h1 className="mt-2 text-4xl font-semibold">Refund policy</h1>
      <p className="mt-4 text-lg text-stone">
        We want you to be happy with your gear. Here is exactly what we can do, and what we can't.
      </p>
      <ol className="mt-8 space-y-6">
        {POLICY_SECTIONS.map((section, index) => (
          <li key={section.title} className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="text-xl font-semibold">
              <span className="mr-2 font-mono text-base text-clay">{index + 1}.</span>
              {section.title}
            </h2>
            <p className="mt-2 text-stone">{section.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-stone">
        Questions?{' '}
        <Link href="/support" className="text-moss underline">
          Ask Lulu
        </Link>
        , our support assistant.
      </p>
    </article>
  )
}
