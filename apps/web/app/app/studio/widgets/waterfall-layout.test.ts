import { describe, expect, it } from 'vitest'
import { layoutWaterfall, type WaterfallStep } from './waterfall-layout'

// The recorded all-leaky run: $467.00 for the merchant and $24.00 for customers.
const LEAKY: WaterfallStep[] = [
  { id: 'double-clicker', label: 'Double-Clicker', merchant: 24, customer: 24, start: 0 },
  { id: 'cart-shuffler', label: 'Cart Shuffler', merchant: 353, customer: 0, start: 48 },
  { id: 'echo', label: 'The Echo', merchant: 54, customer: 0, start: 401 },
  { id: 'bouncer', label: 'The Bouncer', merchant: 36, customer: 0, start: 455 },
  { id: 'total', label: 'Total', merchant: 467, customer: 24, start: 0 },
]
const SEALED = LEAKY.map((step) => ({ ...step, merchant: 0, customer: 0, start: 0 }))

describe('the leak waterfall', () => {
  it('keeps its words at 12 px or more, even in the smallest widget', () => {
    for (const [width, height] of [
      [380, 176],
      [459, 140],
      [527, 332],
    ] as const) {
      const { font } = layoutWaterfall(LEAKY, 491, width, height)
      expect(Math.min(font.axis, font.label, font.value)).toBeGreaterThanOrEqual(12)
    }
  })

  it('grows when the widget is expanded', () => {
    const small = layoutWaterfall(LEAKY, 491, 527, 332)
    const large = layoutWaterfall(LEAKY, 491, 1120, 680)
    expect(large.font.label).toBeGreaterThan(small.font.label)
    expect(large.bars[0]?.width).toBeGreaterThan(small.bars[0]?.width ?? 0)
  })

  it('wraps a name onto two lines only when its column is too narrow', () => {
    const narrow = layoutWaterfall(LEAKY, 491, 380, 240)
    const wide = layoutWaterfall(LEAKY, 491, 1120, 680)
    expect(narrow.bars[0]?.label.lines).toEqual(['Double-', 'Clicker'])
    expect(wide.bars[0]?.label.lines).toEqual(['Double-Clicker'])
  })

  it('draws every bar inside the chart', () => {
    for (const [width, height] of [
      [380, 176],
      [527, 332],
      [1120, 680],
    ] as const) {
      const layout = layoutWaterfall(LEAKY, 491, width, height)
      const top = Math.min(...layout.ticks.map((t) => t.y))
      const bottom = Math.max(...layout.ticks.map((t) => t.y))
      for (const bar of layout.bars) {
        expect(bar.x).toBeGreaterThanOrEqual(layout.grid.x1)
        expect(bar.x + bar.width).toBeLessThanOrEqual(layout.grid.x2)
        for (const block of [bar.merchant, bar.customer]) {
          if (!block) continue
          expect(block.y).toBeGreaterThanOrEqual(top - 0.01)
          expect(block.y + block.height).toBeLessThanOrEqual(bottom + 0.01)
        }
      }
      expect(layout.bars.at(-1)?.value.text).toMatch(/^−\$491/)
    }
  })

  it('drops the cents when the columns get narrow', () => {
    expect(layoutWaterfall(LEAKY, 491, 1120, 680).bars[1]?.value.text).toBe('−$353.00')
    expect(layoutWaterfall(LEAKY, 491, 300, 240).bars[1]?.value.text).toBe('−$353')
  })

  it('shows a sealed run as flat lines at $0', () => {
    const layout = layoutWaterfall(SEALED, 0, 527, 332)
    expect(layout.ticks.map((t) => t.text).filter(Boolean)).toEqual(['$0'])
    for (const bar of layout.bars) {
      expect(bar.zeroY).toBeDefined()
      expect(bar.value).toMatchObject({ text: '✓', leak: false })
    }
  })
})
