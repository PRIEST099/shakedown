import { AddToCart } from '@/components/AddToCart'
import { ProductArt } from '@/components/ProductArt'
import { CATALOG } from '@/lib/catalog'

const price = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default function Shop() {
  return (
    <>
      <section className="max-w-2xl">
        <p className="font-mono text-xs tracking-[0.2em] text-clay">EST. IN THE SANDBOX</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
          Gear for long hauls.
        </h1>
        <p className="mt-4 text-lg text-stone">
          Four honest things for walking a long way with a llama. Pay with PayPal or a card; it's
          all sandbox money.
        </p>
      </section>

      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CATALOG.map((product) => (
          <li
            key={product.sku}
            className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper"
          >
            <ProductArt art={product.art} className="aspect-[4/3] w-full" />
            <div className="flex flex-1 flex-col gap-2 p-5">
              <h2 className="text-lg font-semibold leading-snug">{product.name}</h2>
              <p className="flex-1 text-sm text-stone">{product.blurb}</p>
              <p className="font-mono text-base font-semibold text-clay">
                {price(product.priceCents)}
              </p>
              <AddToCart sku={product.sku} name={product.name} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
