'use client'

import Link from 'next/link'
import { useCart } from './CartProvider'

export function CartLink() {
  const { count, ready } = useCart()
  return (
    <Link
      href="/cart"
      className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold hover:border-moss"
    >
      Cart
      <span
        className="min-w-6 rounded-full bg-clay px-1.5 py-0.5 text-center text-xs text-paper"
        aria-hidden="true"
      >
        {ready ? count : 0}
      </span>
      <span className="sr-only">{ready ? count : 0} items</span>
    </Link>
  )
}
