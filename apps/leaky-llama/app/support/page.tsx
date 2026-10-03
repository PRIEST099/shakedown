import { cookies } from 'next/headers'
import Link from 'next/link'
import { SupportChat } from '@/components/SupportChat'
import { claudeConfigured } from '@/lib/anthropic'
import { decodeMode, MODE_COOKIE } from '@/lib/mode'

export const metadata = { title: 'Help · Leaky Llama Supply Co.' }
export const dynamic = 'force-dynamic'

export default async function SupportPage() {
  const mode = decodeMode((await cookies()).get(MODE_COOKIE)?.value)
  const connected = claudeConfigured()
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-4xl font-semibold">Help</h1>
        <p className="mt-3 text-lg text-stone">
          Lulu, our support assistant, can look up your order and help with refunds under our{' '}
          <Link href="/policy" className="text-moss underline">
            refund policy
          </Link>
          .
        </p>
        {!connected && (
          <p className="mt-4 rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">
            Lulu isn't connected yet: this store has no Claude API key. Add ANTHROPIC_API_KEY to
            .env.local and restart the store.
          </p>
        )}
        <div className="mt-6">
          <SupportChat wiring={mode['policy-lawyer']} connected={connected} />
        </div>
      </section>
      <aside className="space-y-4 text-sm">
        <div className="rounded-2xl border border-line bg-paper p-5">
          <h2 className="text-lg font-semibold">Have these ready</h2>
          <ul className="mt-2 space-y-1 text-stone">
            <li>Your order number, like LL-10042</li>
            <li>The email address you ordered with</li>
          </ul>
        </div>
        <p className="text-xs text-stone">
          Lulu runs on Claude. Refunds happen in the PayPal sandbox, so no real money moves.
        </p>
      </aside>
    </div>
  )
}
