'use client'

import { useState } from 'react'
import { useCart } from './CartProvider'

export function AddToCart({ sku, name }: { sku: string; name: string }) {
  const { add } = useCart()
  const [added, setAdded] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        add(sku)
        setAdded(true)
        setTimeout(() => setAdded(false), 1400)
      }}
      className="w-full rounded-full bg-moss px-4 py-2.5 text-sm font-semibold text-sand transition hover:bg-moss-dark"
      aria-label={`Add ${name} to cart`}
    >
      <span aria-live="polite">{added ? 'Added ✓' : 'Add to cart'}</span>
    </button>
  )
}
