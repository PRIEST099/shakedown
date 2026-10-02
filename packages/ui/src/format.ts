/** The true minus sign (U+2212). Money never uses an ASCII hyphen. */
export const MINUS = '−'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Format integer cents as USD, e.g. -3600 → "−$36.00". Zero has no sign. */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents)
  if (rounded === 0) return '$0.00'
  return usd.format(rounded / 100).replace('-', MINUS)
}

/** Parse a decimal money string such as "36.00" or "−153" into integer cents. */
export function parseMoney(decimal: string): number {
  const match = /^([-−])?(\d+)(?:\.(\d{1,2}))?$/.exec(decimal.trim())
  if (!match) throw new Error(`Not a money amount: ${decimal}`)
  const [, sign, whole = '0', fraction = ''] = match
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return sign ? -cents : cents
}
