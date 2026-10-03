import { cookies } from 'next/headers'
import Link from 'next/link'
import { getDb } from '@/lib/db/client'
import { ordersForVisitor, STATUS_LABEL } from '@/lib/history'
import { VISITOR_COOKIE } from '@/lib/mode'

export const metadata = { title: 'Your orders · Leaky Llama Supply Co.' }
export const dynamic = 'force-dynamic'

const price = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default async function OrdersPage() {
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value
  const list = await ordersForVisitor(await getDb(), visitorId)
  return (
    <>
      <h1 className="text-3xl font-semibold">Your orders</h1>
      {list.length === 0 ? (
        <p className="mt-6 text-stone">
          No orders from this browser yet.{' '}
          <Link href="/" className="text-moss underline">
            Browse the shop
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper">
          {list.map((order) => (
            <li key={order.number}>
              <Link
                href={`/orders/${order.number}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-sand/50"
              >
                <span>
                  <span className="font-mono font-semibold">{order.number}</span>
                  <span className="ml-3 text-sm text-stone">
                    {order.items.map((item) => `${item.qty} × ${item.name}`).join(', ')}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  {order.shipments > 1 && (
                    <span className="rounded-full bg-clay px-2 py-0.5 text-xs font-semibold text-paper">
                      Shipped ×{order.shipments}
                    </span>
                  )}
                  <span className="text-stone">{STATUS_LABEL[order.status] ?? order.status}</span>
                  <span className="font-mono font-semibold">{price(order.amountCents)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
