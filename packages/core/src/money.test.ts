import { describe, expect, it } from 'vitest'
import { toCents, toDecimal } from './money'

describe('money', () => {
  it('parses PayPal amount strings into integer cents', () => {
    expect(toCents('36.00')).toBe(3600)
    expect(toCents('0.07')).toBe(7)
    expect(toCents('0.7')).toBe(70)
    expect(toCents('1234')).toBe(123400)
    expect(toCents('-12.34')).toBe(-1234)
    expect(toCents(' 9.99 ')).toBe(999)
  })

  it('refuses anything that is not a PayPal amount', () => {
    for (const bad of ['', '1.234', '1.2.3', 'abc', '1e3', '$4.00', '1,000.00']) {
      expect(() => toCents(bad)).toThrow(/Not a PayPal amount/)
    }
  })

  it('renders cents back to the string PayPal expects', () => {
    expect(toDecimal(3600)).toBe('36.00')
    expect(toDecimal(7)).toBe('0.07')
    expect(toDecimal(0)).toBe('0.00')
    expect(toDecimal(-1234)).toBe('-12.34')
  })

  it('round-trips without drifting, which floats would', () => {
    for (const value of ['0.01', '0.10', '19.99', '100.00', '123456.78']) {
      expect(toDecimal(toCents(value))).toBe(value.length === 4 ? value : value)
    }
    expect(toCents('0.1') + toCents('0.2')).toBe(toCents('0.30'))
  })
})
