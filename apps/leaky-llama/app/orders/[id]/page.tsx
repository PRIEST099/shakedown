import { CAST } from '@shakedown/core/cast'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db/client'
import { orderForViewer, STATUS_LABEL } from '@/lib/history'
import { VISITOR_COOKIE } from '@/lib/mode'

export const dynamic = 'force-dynamic'

const price = (cents: number) => `$${(cents / 100).toFixed(2)}`
const time = (iso: string) =>
  `${new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  })} UTC`

export default async function OrderPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ placed?: string }>
}) {
  const { id } = await props.params
  const { placed } = await props.searchParams
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value
  const order = await orderForViewer(await getDb(), decodeURIComponent(id), visitorId)
  if (!order?.found) notFound()

  const shipments = order.shipments ?? []
  const shippedValue = shipments.reduce((sum, row) => sum + row.valueCents, 0)

  return (
    <article className="space-y-8">
      {placed && (
        <p role="status" className="rounded-2xl bg-moss px-5 py-4 text-sand">
          {order.status === 'declined'
            ? 'Your payment was declined, so nothing was charged.'
            : order.status === 'held'
              ? 'Thanks. Your order is on hold while we check the payment.'
              : 'Thanks! Your order is placed.'}
        </p>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-stone">ORDER</p>
          <h1 className="font-mono text-3xl font-semibold">{order.orderId}</h1>
          <p className="mt-1 text-sm text-stone">
            Placed {time(order.createdAt.toISOString())} · receipt to {order.email}
          </p>
        </div>
        <p className="rounded-full border border-line bg-paper px-4 py-1.5 text-sm font-semibold">
          {STATUS_LABEL[order.status] ?? order.status}
        </p>
      </header>

      {shipments.length > 1 && (
        <p role="alert" className="rounded-2xl border border-clay bg-clay/10 px-5 py-4 text-clay">
          <strong>Shipped {shipments.length} times</strong> for one payment of{' '}
          {price(order.capturedCents ?? 0)}. Goods worth {price(shippedValue)} left the warehouse.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-paper p-5">
          <h2 className="text-lg font-semibold">Items</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.items?.map((item) => (
              <li key={item.sku} className="flex justify-between gap-3">
                <span>
                  {item.qty} × {item.name}
                </span>
                <span className="font-mono">{price(item.qty * item.unitCents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-line pt-3 font-semibold">
            <span>Total</span>
            <span className="font-mono">{price(order.amountCents)}</span>
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-paper p-5">
          <h2 className="text-lg font-semibold">Payment</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-stone">PayPal order</dt>
            <dd className="break-all font-mono">{order.paypalOrderId ?? '—'}</dd>
            <dt className="text-stone">Capture</dt>
            <dd className="break-all font-mono">{order.captureId ?? '—'}</dd>
            <dt className="text-stone">Captured</dt>
            <dd className="font-mono">{price(order.capturedCents ?? 0)}</dd>
            <dt className="text-stone">Refunded</dt>
            <dd className="font-mono">{price(order.refundedCents ?? 0)}</dd>
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-paper p-5">
        <h2 className="text-lg font-semibold">Shipments</h2>
        {shipments.length === 0 ? (
          <p className="mt-2 text-sm text-stone">Nothing has shipped.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-sm">
            {shipments.map((row, index) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-3">
                <span>
                  Shipment {index + 1} · released by the <strong>{row.source}</strong>{' '}
                  {row.source === 'checkout'
                    ? 'route'
                    : row.source === 'webhook'
                      ? 'listener'
                      : 'team'}
                </span>
                <span className="font-mono text-stone">
                  {price(row.valueCents)} · {time(row.at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {(order.refunds?.length ?? 0) + (order.disputes?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-line bg-paper p-5">
          <h2 className="text-lg font-semibold">Refunds and disputes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.refunds?.map((row) => (
              <li key={`r-${row.paypalRefundId}-${row.at}`} className="flex justify-between gap-3">
                <span>
                  Refund <span className="font-mono">{row.paypalRefundId ?? '—'}</span> via{' '}
                  {row.source}
                </span>
                <span className="font-mono">{price(row.amountCents)}</span>
              </li>
            ))}
            {order.disputes?.map((row) => (
              <li key={`d-${row.id}`}>
                <p className="flex justify-between gap-3">
                  <span>
                    Dispute <span className="font-mono">{row.id}</span> · {row.status} ·{' '}
                    {row.response.replaceAll('_', ' ')}
                  </span>
                  <span className="font-mono">{price(row.amountCents)}</span>
                </p>
                {row.detail && <p className="mt-1 text-stone">{row.detail}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-paper p-5">
        <h2 className="text-lg font-semibold">Notifications from PayPal</h2>
        {(order.webhooks?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-stone">None received for this order yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-stone">
                <tr>
                  <th className="py-2 pr-4 font-medium">Received</th>
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 pr-4 font-medium">Signature</th>
                  <th className="py-2 font-medium">What the store did</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {order.webhooks?.map((row) => (
                  <tr key={row.deliveryId}>
                    <td className="py-2 pr-4 font-mono text-xs">{time(row.receivedAt)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {row.eventType}
                      <span className="block text-stone">{row.eventId}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {row.verification === 'skipped' ? 'not checked' : row.verification}
                    </td>
                    <td className="py-2">
                      <strong>{row.outcome}</strong>
                      {row.detail && <span className="block text-stone">{row.detail}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-line p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone">
          Switches this order was placed under
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {CAST.map((persona) => {
            const sealed = order.mode?.[persona.id] === 'sealed'
            return (
              <li
                key={persona.id}
                className={`rounded-full px-3 py-1 font-mono ${sealed ? 'bg-moss/10 text-moss' : 'bg-clay/10 text-clay'}`}
              >
                {persona.tests}: {sealed ? 'sealed' : 'leaky'}
              </li>
            )
          })}
        </ul>
        {order.campaignId && (
          <p className="mt-3 text-xs text-stone">
            Placed by Shakedown campaign <span className="font-mono">{order.campaignId}</span>.
          </p>
        )}
      </section>

      <Link href="/orders" className="inline-block text-moss underline">
        ← All your orders
      </Link>
    </article>
  )
}
