'use client'

import type { EventPayload as CardFieldsEvent } from '@paypal/react-paypal-js/sdk-v6'
import {
  PayPalCardCvvField,
  PayPalCardExpiryField,
  PayPalCardFieldsProvider,
  PayPalCardNameField,
  PayPalCardNumberField,
  PayPalOneTimePaymentButton,
  PayPalProvider,
  usePayPalCardFieldsOneTimePaymentSession,
} from '@paypal/react-paypal-js/sdk-v6'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG } from '@/lib/catalog'
import { useCart } from './CartProvider'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`

type Notice = { tone: 'info' | 'error'; text: string } | null

export function Checkout({ clientId }: { clientId: string }) {
  const { lines, setQty, clear, ready } = useCart()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  // One key per checkout attempt. A sealed store uses it to turn a double submit into one order.
  const checkoutKey = useMemo(() => crypto.randomUUID(), [])
  // PayPal reports each hosted field's validity; pay only once number, expiry and CVV are valid.
  const [cardReady, setCardReady] = useState(false)
  const onValidity = useCallback((event: CardFieldsEvent) => {
    const { number, expiry, cvv } = event.data
    setCardReady(number.isValid && expiry.isValid && cvv.isValid)
  }, [])

  const priced = useMemo(
    () =>
      lines.flatMap((line) => {
        const product = CATALOG.find((p) => p.sku === line.sku)
        return product ? [{ ...line, product }] : []
      }),
    [lines],
  )
  const total = priced.reduce((sum, line) => sum + line.qty * line.product.priceCents, 0)

  const createOrder = useCallback(async () => {
    if (!EMAIL.test(email)) {
      setNotice({ tone: 'error', text: 'Enter your email address first.' })
      throw new Error('Email required')
    }
    setNotice(null)
    const res = await fetch('/api/checkout/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        checkoutKey,
        lines: priced.map((line) => ({
          sku: line.sku,
          qty: line.qty,
          unitCents: line.product.priceCents,
        })),
      }),
    })
    const body = (await res.json()) as { orderId?: string; error?: string }
    if (!res.ok || !body.orderId) {
      setNotice({ tone: 'error', text: body.error ?? 'Could not start the payment.' })
      throw new Error(body.error ?? 'create failed')
    }
    return { orderId: body.orderId }
  }, [email, checkoutKey, priced])

  const capturing = useRef(false)
  const capture = useCallback(
    async (orderId: string) => {
      if (capturing.current) return
      capturing.current = true
      setNotice({ tone: 'info', text: 'Confirming your payment…' })
      const res = await fetch(`/api/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines: priced.map((line) => ({ sku: line.sku, qty: line.qty })) }),
      })
      const body = (await res.json()) as {
        kind?: string
        orderNumber?: string
        reason?: string
        error?: string
      }
      if (body.kind === 'paid' && body.orderNumber) {
        clear()
        router.push(`/orders/${body.orderNumber}?placed=1`)
      } else if (body.kind === 'held' && body.orderNumber) {
        clear()
        router.push(`/orders/${body.orderNumber}?placed=1`)
      } else if (body.kind === 'declined') {
        setNotice({ tone: 'error', text: `${body.reason} Nothing was charged. Try another card.` })
      } else {
        setNotice({ tone: 'error', text: body.error ?? 'The payment could not be completed.' })
      }
      capturing.current = false
    },
    [priced, clear, router],
  )

  if (!ready) return <p className="text-stone">Loading your cart…</p>

  if (priced.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-8">
        <p className="text-lg">Your cart is empty.</p>
        <a href="/" className="mt-3 inline-block text-moss underline">
          Back to the shop
        </a>
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section
        aria-labelledby="cart-heading"
        className="rounded-2xl border border-line bg-paper p-6"
      >
        <h2 id="cart-heading" className="text-xl font-semibold">
          Your cart
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {priced.map((line) => (
            <li key={line.sku} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{line.product.name}</p>
                <p className="text-sm text-stone">{price(line.product.priceCents)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`One fewer ${line.product.name}`}
                  onClick={() => setQty(line.sku, line.qty - 1)}
                  className="h-8 w-8 rounded-full border border-line hover:border-moss"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono" aria-live="polite">
                  {line.qty}
                </span>
                <button
                  type="button"
                  aria-label={`One more ${line.product.name}`}
                  onClick={() => setQty(line.sku, line.qty + 1)}
                  className="h-8 w-8 rounded-full border border-line hover:border-moss"
                >
                  +
                </button>
                <span className="w-24 text-right font-mono font-semibold">
                  {price(line.qty * line.product.priceCents)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex justify-between border-t border-line pt-4 text-lg font-semibold">
          <span>Total</span>
          <span className="font-mono">{price(total)}</span>
        </p>
      </section>

      <section
        aria-labelledby="pay-heading"
        className="rounded-2xl border border-line bg-paper p-6"
      >
        <h2 id="pay-heading" className="text-xl font-semibold">
          Pay
        </h2>
        <label className="mt-4 block text-sm font-semibold" htmlFor="email">
          Email for your receipt
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-lg border border-line bg-sand/40 px-3 py-2"
        />

        {notice && (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              notice.tone === 'error' ? 'bg-clay/10 text-clay' : 'bg-moss/10 text-moss'
            }`}
          >
            {notice.text}
          </p>
        )}

        <PayPalProvider
          clientId={clientId}
          environment="sandbox"
          components={['paypal-payments', 'card-fields']}
          pageType="checkout"
        >
          <div className="mt-5">
            <PayPalOneTimePaymentButton
              createOrder={createOrder}
              onApprove={async ({ orderId }) => capture(orderId)}
              onCancel={() =>
                setNotice({ tone: 'info', text: 'Payment cancelled. Your cart is still here.' })
              }
              onError={(error) => setNotice({ tone: 'error', text: `PayPal: ${error.message}` })}
            />
          </div>
          <p className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-stone">
            <span className="h-px flex-1 bg-line" /> or pay by card{' '}
            <span className="h-px flex-1 bg-line" />
          </p>
          <PayPalCardFieldsProvider validitychange={onValidity}>
            <CardForm
              total={total}
              ready={cardReady}
              createOrder={createOrder}
              capture={capture}
              setNotice={setNotice}
            />
          </PayPalCardFieldsProvider>
        </PayPalProvider>
        <p className="mt-4 text-xs text-stone">
          Sandbox only. Use a PayPal sandbox buyer account, or a sandbox test card.
        </p>
      </section>
    </div>
  )
}

function CardForm({
  total,
  ready,
  createOrder,
  capture,
  setNotice,
}: {
  total: number
  ready: boolean
  createOrder: () => Promise<{ orderId: string }>
  capture: (orderId: string) => Promise<void>
  setNotice: (notice: Notice) => void
}) {
  const { submit, submitResponse, error } = usePayPalCardFieldsOneTimePaymentSession()
  const [busy, setBusy] = useState(false)
  const handled = useRef<typeof submitResponse>(null)

  useEffect(() => {
    // The callbacks change identity on re-render, so this effect can re-run for the same
    // response. Act on each response once: a second capture is exactly the bug Shakedown tests.
    if (!submitResponse || handled.current === submitResponse) return
    handled.current = submitResponse
    if (submitResponse.state === 'succeeded') {
      void capture(submitResponse.data.orderId).finally(() => setBusy(false))
    } else {
      setBusy(false)
      setNotice({
        tone: 'error',
        text:
          submitResponse.state === 'failed'
            ? 'The card could not be confirmed. Check the details and try again.'
            : 'Card payment cancelled.',
      })
    }
  }, [submitResponse, capture, setNotice])

  useEffect(() => {
    if (!error) return
    // A rejected card form must hand the button back, or the customer is stuck on "Paying…".
    setBusy(false)
    setNotice({ tone: 'error', text: `Card fields: ${error.message}` })
  }, [error, setNotice])

  // PayPal draws each field's border inside its own frame; the container only fixes the height.
  const field = 'h-12'
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        try {
          const { orderId } = await createOrder()
          await submit(orderId)
        } catch {
          setBusy(false)
        }
      }}
      className="space-y-3"
    >
      <PayPalCardNumberField placeholder="Card number" containerClassName={field} />
      <div className="grid grid-cols-2 gap-3">
        <PayPalCardExpiryField placeholder="MM / YY" containerClassName={field} />
        <PayPalCardCvvField placeholder="CVV" containerClassName={field} />
      </div>
      <PayPalCardNameField placeholder="Name on card" containerClassName={field} />
      <button
        type="submit"
        disabled={busy || !ready}
        className="w-full rounded-full bg-moss px-4 py-3 font-semibold text-sand transition hover:bg-moss-dark disabled:opacity-60"
      >
        {busy ? 'Paying…' : `Pay ${price(total)} by card`}
      </button>
      {!ready && !busy && (
        <p className="text-center text-xs text-stone">Enter the card number, expiry and CVV.</p>
      )}
    </form>
  )
}
