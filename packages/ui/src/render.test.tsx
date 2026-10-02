import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CAST } from '@shakedown/core/cast'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Imp } from './cast/Imp'
import { PLACEHOLDER_RUN } from './fixtures'
import { MINUS } from './format'
import { LedgerNumber } from './LedgerNumber'
import { PersonaCard } from './PersonaCard'
import { Tape } from './Tape'

describe('components render on the server', () => {
  it('renders a fully printed tape with evidence and the accessible total', () => {
    const html = renderToStaticMarkup(
      <Tape
        meta="Sandbox · Leaky Llama Supply Co. · run #0042"
        lines={PLACEHOLDER_RUN.before}
        total={{ fromCents: -13500, toCents: -15300, progress: 1 }}
        tone="leak"
      />,
    )
    expect(html).toContain('Double-Clicker')
    expect(html).toContain('2 captures · 1 order')
    expect(html).toContain(`${MINUS}$153.00`)
    expect(html).toContain('Leak: ')
  })

  it('renders every cast member as an imp and a card', () => {
    for (const persona of CAST) {
      expect(renderToStaticMarkup(<Imp persona={persona.id} />)).toContain('<svg')
      expect(
        renderToStaticMarkup(<PersonaCard persona={persona.id} state="leak" amountCents={-3600} />),
      ).toContain(persona.name)
    }
  })

  it('gives the ledger number a screen-reader value', () => {
    const html = renderToStaticMarkup(
      <LedgerNumber fromCents={-15300} toCents={0} progress={0.3} />,
    )
    expect(html).toContain('<span class="sd-sr-only">$0.00</span>')
  })
})

describe('brand guard', () => {
  it('never writes the PayPal name in all caps in source', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(tsx?|css)$/.test(entry) && !entry.endsWith('.test.tsx')) files.push(path)
      }
    }
    walk(join(import.meta.dirname, '.'))
    const offenders = files.filter((f) => /PAYPAL(?!_)/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
