import { describe, expect, it } from 'vitest'
import { formatCents, MINUS, parseMoney } from './format'

describe('money formatting', () => {
  it('uses the true minus sign and no sign for zero', () => {
    expect(formatCents(-3600)).toBe(`${MINUS}$36.00`)
    expect(formatCents(15300)).toBe('$153.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(-0.4)).toBe('$0.00')
    expect(formatCents(-123456)).toBe(`${MINUS}$1,234.56`)
  })

  it('parses decimal strings into integer cents', () => {
    expect(parseMoney('36.00')).toBe(3600)
    expect(parseMoney('-1.5')).toBe(-150)
    expect(parseMoney(`${MINUS}153`)).toBe(-15300)
    expect(() => parseMoney('12.345')).toThrow()
    expect(() => parseMoney('abc')).toThrow()
  })
})
