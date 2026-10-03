/** Money is integer cents everywhere inside the engine. Never floats. */
export type Cents = number

/** Parse a PayPal decimal amount string ("36.00") into integer cents. */
export function toCents(decimal: string): Cents {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(decimal.trim())
  if (!match) throw new Error(`Not a PayPal amount: ${decimal}`)
  const [, sign, whole = '0', fraction = ''] = match
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return sign ? -cents : cents
}

/** Render integer cents as a PayPal decimal amount string. */
export function toDecimal(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
