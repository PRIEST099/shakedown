import { Checkout } from '@/components/Checkout'

export const metadata = { title: 'Cart · Leaky Llama Supply Co.' }

export default function CartPage() {
  // The client ID is public by design; the secret never leaves the server.
  const clientId = process.env.PAYPAL_CLIENT_ID ?? ''
  return (
    <>
      <h1 className="mb-8 text-3xl font-semibold">Checkout</h1>
      {clientId ? (
        <Checkout clientId={clientId} />
      ) : (
        <p className="rounded-lg bg-clay/10 p-4 text-clay">
          PAYPAL_CLIENT_ID is not set, so checkout is unavailable.
        </p>
      )}
    </>
  )
}
