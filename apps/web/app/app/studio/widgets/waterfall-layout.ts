/**
 * The leak waterfall's geometry, in real pixels for the size it is drawn at. Laying it out per size,
 * instead of scaling one fixed drawing, keeps its words readable in a small widget and lets it grow
 * when the widget is expanded.
 */

export interface WaterfallStep {
  id: string
  label: string
  merchant: number
  customer: number
  /** The running total this step starts from. */
  start: number
}

interface Block {
  y: number
  height: number
}

export interface WaterfallBar {
  id: string
  total: boolean
  x: number
  width: number
  merchant?: Block
  customer?: Block
  /** A customer whose checks held: a flat line where its bar would start. */
  zeroY?: number
  /** The dotted step from this bar to the next one. */
  connector?: { x1: number; x2: number; y: number }
  value: { x: number; y: number; text: string; leak: boolean }
  label: { x: number; y: number; lines: string[] }
}

export interface WaterfallLayout {
  width: number
  height: number
  font: { axis: number; label: number; value: number }
  grid: { x1: number; x2: number }
  ticks: { y: number; text: string }[]
  bars: WaterfallBar[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Roughly how wide a line of text is, without measuring it: enough to decide on wrapping. */
const textWidth = (text: string, size: number, mono = false) =>
  text.length * size * (mono ? 0.6 : 0.56)

/** One line if it fits, otherwise split after the first space or hyphen. */
function wrap(label: string, room: number, size: number): string[] {
  if (textWidth(label, size) <= room) return [label]
  const at = label.search(/[ -]/)
  if (at < 0) return [label]
  const cut = label[at] === '-' ? at + 1 : at
  return [label.slice(0, cut), label.slice(cut).trim()]
}

const money = (value: number, cents: boolean) =>
  `$${cents ? value.toFixed(2) : Math.round(value).toLocaleString('en-US')}`

export function layoutWaterfall(
  steps: WaterfallStep[],
  total: number,
  width: number,
  height: number,
): WaterfallLayout {
  // Type grows with the room: 12 px in a small widget, up to 17 px when expanded.
  const base = clamp(Math.round(Math.min(width / 46, height / 20)), 12, 17)
  const font = { axis: base, label: base + 1, value: base }
  const top = Math.max(total, 1)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top)
  const tickText = (tick: number) => (total === 0 ? (tick === 0 ? '$0' : '') : money(tick, false))
  const left = Math.max(...ticks.map((t) => textWidth(tickText(t), font.axis))) + 14
  const right = 12
  const slot = Math.max(1, (width - left - right) / Math.max(steps.length, 1))
  const lines = steps.map((step) => wrap(step.label, slot - 6, font.label))
  const rows = Math.max(1, ...lines.map((l) => l.length))
  const plotTop = font.value + 16
  const plotBottom = height - (rows * (font.label + 4) + 10)
  const plotHeight = Math.max(20, plotBottom - plotTop)
  const y = (value: number) => plotTop + plotHeight - (value / top) * plotHeight
  const barWidth = Math.min(base * 4.5, slot * 0.62)
  // Cents when every value fits its slot; whole dollars when the slots get narrow.
  const cents = steps.every(
    (step) =>
      textWidth(`−${money(step.merchant + step.customer, true)}`, font.value, true) <= slot - 4,
  )

  const bars = steps.map((step, i): WaterfallBar => {
    const x = left + i * slot + (slot - barWidth) / 2
    const amount = step.merchant + step.customer
    const merchantTop = step.start + step.merchant
    const next = steps[i + 1]
    return {
      id: step.id,
      total: step.id === 'total',
      x,
      width: barWidth,
      merchant:
        step.merchant > 0
          ? { y: y(merchantTop), height: Math.max(1, y(step.start) - y(merchantTop)) }
          : undefined,
      customer:
        step.customer > 0
          ? {
              y: y(merchantTop + step.customer),
              height: Math.max(1, y(merchantTop) - y(merchantTop + step.customer)),
            }
          : undefined,
      zeroY: amount === 0 ? y(step.start) : undefined,
      connector:
        next && next.id !== 'total'
          ? { x1: x + barWidth, x2: x + slot, y: y(step.start + amount) }
          : undefined,
      value: {
        x: x + barWidth / 2,
        y: y(step.start + amount) - 6,
        text: amount > 0 ? `−${money(amount, cents)}` : '✓',
        leak: amount > 0,
      },
      label: {
        x: x + barWidth / 2,
        y: plotTop + plotHeight + font.label + 8,
        lines: lines[i] ?? [],
      },
    }
  })

  return {
    width,
    height,
    font,
    grid: { x1: left, x2: width - right },
    ticks: ticks.map((tick) => ({ y: y(tick), text: tickText(tick) })),
    bars,
  }
}
