'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export interface CartLine {
  sku: string
  qty: number
}

interface Cart {
  lines: CartLine[]
  count: number
  ready: boolean
  add(sku: string): void
  setQty(sku: string, qty: number): void
  clear(): void
}

const CartContext = createContext<Cart | null>(null)
const KEY = 'leaky-llama-cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [ready, setReady] = useState(false)

  // Read after mount so the server render and the first client render agree.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[]
      if (Array.isArray(saved)) setLines(saved.filter((line) => line.sku && line.qty > 0))
    } catch {
      // Storage can be unavailable (private windows); an empty cart is fine.
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(KEY, JSON.stringify(lines))
    } catch {
      // Ignore: the cart still works for this page view.
    }
  }, [lines, ready])

  const add = useCallback((sku: string) => {
    setLines((current) => {
      const found = current.find((line) => line.sku === sku)
      return found
        ? current.map((line) =>
            line.sku === sku ? { ...line, qty: Math.min(20, line.qty + 1) } : line,
          )
        : [...current, { sku, qty: 1 }]
    })
  }, [])

  const setQty = useCallback((sku: string, qty: number) => {
    setLines((current) =>
      qty <= 0
        ? current.filter((line) => line.sku !== sku)
        : current.map((line) => (line.sku === sku ? { ...line, qty: Math.min(20, qty) } : line)),
    )
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo(
    () => ({
      lines,
      ready,
      add,
      setQty,
      clear,
      count: lines.reduce((sum, line) => sum + line.qty, 0),
    }),
    [lines, ready, add, setQty, clear],
  )
  return <CartContext value={value}>{children}</CartContext>
}

export function useCart(): Cart {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart must be used inside <CartProvider>.')
  return cart
}
