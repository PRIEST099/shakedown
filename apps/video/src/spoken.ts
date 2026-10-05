/**
 * The script as it should be said aloud: amounts and counts in words, and initialisms the way a
 * person reads them. The scratch voiceover is generated from this; captions keep the written form.
 */

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** 0 to 999,999 in words, American style: "four hundred ninety-one". */
export function numberWords(n: number): string {
  if (n < 20) return ONES[n] ?? String(n)
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`
  if (n < 1000) {
    return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`
  }
  return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`
}

const plural = (n: number, word: string) => `${numberWords(n)} ${word}${n === 1 ? '' : 's'}`

export function spoken(text: string) {
  const out = text.replace(
    /\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g,
    (_, whole: string, cents?: string) => {
      const dollars = Number(whole.replace(/,/g, ''))
      const c = Number(cents ?? 0)
      if (c === 0) return plural(dollars, 'dollar')
      return dollars === 0
        ? plural(c, 'cent')
        : `${plural(dollars, 'dollar')} and ${plural(c, 'cent')}`
    },
  )
  // Initialisms (AI, CI, IDs) need no help: the voice already reads them letter by letter.
  return out.replace(/\b\d{1,6}\b/g, (n) => numberWords(Number(n)))
}

/**
 * Respellings only the synthetic voice needs. Kokoro's pronouncer splits camel case into two
 * stressed words ("PayPal" comes out "Pay. Pal."), but reads "Paypal" as one: PAY-pal.
 */
const RESPELL: [RegExp, string][] = [[/\bPayPal/g, 'Paypal']]

/** The text the scratch voice reads: `spoken`, plus the respellings above. */
export function voiced(text: string) {
  return RESPELL.reduce((out, [from, to]) => out.replace(from, to), spoken(text))
}
