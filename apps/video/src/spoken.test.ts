import { describe, expect, it } from 'vitest'
import { numberWords, spoken } from './spoken'

describe('the script as it is said', () => {
  it('says amounts the way a person reads them', () => {
    expect(spoken('$491.00 would have leaked.')).toBe(
      'four hundred ninety-one dollars would have leaked.',
    )
    expect(spoken('The ledger says $34.00 went past it.')).toBe(
      'The ledger says thirty-four dollars went past it.',
    )
    expect(spoken('a $100.00 limit')).toBe('a one hundred dollars limit')
    expect(spoken('$1.00')).toBe('one dollar')
    expect(spoken('$18.50')).toBe('eighteen dollars and fifty cents')
  })

  it('says counts in words', () => {
    expect(spoken('8 leaks in all.')).toBe('eight leaks in all.')
    expect(numberWords(2026)).toBe('two thousand twenty-six')
    expect(numberWords(40)).toBe('forty')
  })
})
