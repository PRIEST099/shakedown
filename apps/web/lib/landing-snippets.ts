import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CAST, regrade, type SavedRun } from '@shakedown/core'

/**
 * The CLI and CI examples on the landing page, generated from a real recorded run, so the output
 * shown is output Shakedown really printed for that run.
 */

const RECORDED = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'fixtures/recorded')

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

export interface CommentRow {
  customer: string
  tests: string
  result: 'leak' | 'sealed'
  leaks: number
  atRisk: string
}

export interface LandingSnippets {
  cliOutput: string
  comment: { headline: string; rows: CommentRow[] }
}

export function landingSnippets(): LandingSnippets {
  const { run } = JSON.parse(
    readFileSync(path.join(RECORDED, '01-checkout-leaky.json'), 'utf8'),
  ) as {
    run: SavedRun
  }
  const result = regrade(run)
  const name = (id: string) => CAST.find((persona) => persona.id === id)?.name ?? id

  const progress = result.outcomes.map((outcome) => {
    const leaks = outcome.findings.length
    return `  ${leaks ? '✗' : '·'} ${name(outcome.persona)} · ${outcome.title}${leaks ? ` (${leaks} ${leaks === 1 ? 'leak' : 'leaks'})` : ''}`
  })
  const personas = [...new Set(result.outcomes.map((outcome) => outcome.persona))]
  const leaking = personas.filter((id) => result.findings.some((f) => f.persona === id))

  const cliOutput = [
    '$ npx @shakedown-dev/cli run --target http://localhost:3100',
    '',
    `  Shakedown → http://localhost:3100 · seed ${result.seed} · ${personas.length} customers from hell`,
    '',
    ...progress,
    '',
    `  MERCHANT LEAK   ${usd(result.merchantLeakCents).padStart(9)}`,
    `  CUSTOMER HARM   ${usd(result.customerHarmCents).padStart(9)}`,
    '',
    `  ${result.findings.length} LEAKS · reports in .shakedown/ · exit code 1`,
  ].join('\n')

  const rows: CommentRow[] = personas.map((id) => {
    const findings = result.findings.filter((finding) => finding.persona === id)
    const cents = findings.reduce((sum, f) => sum + f.merchantLeakCents + f.customerHarmCents, 0)
    return {
      customer: name(id),
      tests: CAST.find((persona) => persona.id === id)?.tests ?? '',
      result: findings.length ? 'leak' : 'sealed',
      leaks: findings.length,
      atRisk: findings.length ? usd(cents) : '—',
    }
  })

  return {
    cliOutput,
    comment: {
      headline: `Shakedown: ${leaking.length} of ${personas.length} customers from hell got through. ${usd(result.merchantLeakCents)} at risk for the merchant, ${usd(result.customerHarmCents)} for customers.`,
      rows,
    },
  }
}
