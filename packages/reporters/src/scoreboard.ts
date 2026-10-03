import type { CampaignResult, Finding, ScenarioOutcome } from '@shakedown/core'
import { CAST, toDecimal } from '@shakedown/core'
import { ink } from './ansi'

/**
 * The receipt. One line per property tested, red where money can leave and sealed where it
 * cannot, then the total at the bottom. Phase 7 adds JSON, HTML, JUnit and Markdown beside it.
 */

const WIDTH = 66
const rule = (char = '─') => char.repeat(WIDTH)

const pad = (left: string, right: string, width = WIDTH) => {
  const gap = Math.max(1, width - visibleLength(left) - visibleLength(right))
  return `${left}${' '.repeat(gap)}${right}`
}

/** Length without the ANSI escapes, so columns still line up when colour is on. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes is the point
const visibleLength = (text: string) => text.replace(/\u001B\[[0-9;]*m/g, '').length

function wrapText(text: string, width: number, indent: string): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      if (line) lines.push(indent + line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(indent + line)
  return lines
}

const personaHeading = (outcome: ScenarioOutcome) => {
  const persona = CAST.find((entry) => entry.id === outcome.persona)
  if (!persona) return outcome.persona
  return pad(ink.bold(`${persona.number}. ${persona.name.toUpperCase()}`), ink.dim(persona.channel))
}

const money = (cents: number) => `$${toDecimal(cents)}`

/** Whose money a finding puts at risk. Merchant loss and customer harm are never added together. */
function atRisk(finding: Finding): string {
  const parts: string[] = []
  if (finding.merchantLeakCents > 0) parts.push(`${money(finding.merchantLeakCents)} merchant`)
  if (finding.customerHarmCents > 0) parts.push(`${money(finding.customerHarmCents)} customer`)
  return parts.length ? ink.leak(parts.join(' · ')) : ink.dim('$0.00 this time')
}

function findingBlock(finding: Finding): string[] {
  const lines = [`  ${ink.leak('✗')} ${ink.bold(finding.title)}`]
  lines.push(...wrapText(finding.detail, WIDTH - 6, '    '))
  lines.push('')
  for (const item of finding.evidence) {
    lines.push(`    ${ink.dim(item.label.padEnd(28))}${item.value}`)
  }
  lines.push(`    ${ink.dim('At risk'.padEnd(28))}${atRisk(finding)}`)
  lines.push('')
  const [first, ...rest] = wrapText(`Fix: ${finding.fix}`, WIDTH - 6, '    ')
  if (first) lines.push(first.replace('Fix:', ink.mark('Fix:')))
  lines.push(...rest)
  return lines
}

export interface ScoreboardOptions {
  /** Show the properties that held, not just the ones that did not. */
  showSealed?: boolean
}

export function scoreboard(result: CampaignResult, options: ScoreboardOptions = {}): string {
  const showSealed = options.showSealed ?? true
  const lines: string[] = ['', ink.bold('  SHAKEDOWN'), `  ${ink.dim('The returns desk')}`, '']
  lines.push(`  ${rule()}`)
  lines.push(`  ${pad(ink.dim('Target'), result.target)}`)
  lines.push(`  ${pad(ink.dim('Campaign'), result.campaignId)}`)
  lines.push(`  ${pad(ink.dim('Seed'), String(result.seed))}`)
  lines.push(`  ${rule()}`)

  let persona = ''
  for (const outcome of result.outcomes) {
    if (outcome.persona !== persona) {
      persona = outcome.persona
      lines.push('', `  ${personaHeading(outcome)}`, '')
    }

    if (outcome.skipped) {
      lines.push(`  ${ink.dim('–')} ${outcome.title}${ink.dim(` (skipped: ${outcome.skipped})`)}`)
      continue
    }

    for (const { invariant, result: graded } of outcome.results) {
      if (graded.verdict === 'leak') continue
      if (graded.verdict === 'sealed' && !showSealed) continue
      const mark = graded.verdict === 'sealed' ? ink.sealed('✓') : ink.dim('·')
      const note = graded.verdict === 'sealed' ? '' : ink.dim(' (inconclusive)')
      lines.push(`  ${mark} ${invariant.title}${note}`)
      // Inconclusive means a person should look, so say what Shakedown saw.
      if (graded.verdict === 'inconclusive') {
        lines.push(...wrapText(graded.detail, WIDTH - 6, '    ').map((line) => ink.dim(line)))
      }
    }

    for (const finding of outcome.findings) {
      lines.push('', ...findingBlock(finding))
    }

    if (outcome.error) {
      lines.push(`  ${ink.dim(`! ${outcome.error}`)}`)
    }
  }

  const total = (cents: number) =>
    cents > 0 ? ink.leak(ink.bold(money(cents))) : ink.sealed(ink.bold(money(0)))
  lines.push('', `  ${rule()}`)
  lines.push(`  ${pad(ink.bold('MERCHANT LEAK'), total(result.merchantLeakCents))}`)
  lines.push(`  ${pad(ink.dim('  goods or money out, nothing in'), '')}`)
  lines.push(`  ${pad(ink.bold('CUSTOMER HARM'), total(result.customerHarmCents))}`)
  lines.push(`  ${pad(ink.dim('  customers charged for nothing'), '')}`)
  lines.push(`  ${rule()}`)
  const inconclusive = result.outcomes.flatMap((outcome) =>
    outcome.results.filter((entry) => entry.result.verdict === 'inconclusive'),
  ).length
  const skipped = result.outcomes.filter((outcome) => outcome.skipped).length
  if (inconclusive || skipped) {
    lines.push(
      `  ${ink.dim(
        [inconclusive && `${inconclusive} inconclusive`, skipped && `${skipped} skipped`]
          .filter(Boolean)
          .join(' · '),
      )}`,
    )
  }
  lines.push('')
  lines.push(`  ${stamp(result)}`)
  if (result.stoppedEarly) {
    lines.push('', `  ${ink.dim(`Stopped early: ${result.stoppedEarly}`)}`)
  }
  lines.push('')
  return lines.join('\n')
}

function stamp(result: CampaignResult): string {
  const count = result.findings.length
  if (count === 0) return ink.sealed(ink.invert('  SEALED  '))
  return ink.leak(ink.invert(`  ${count} ${count === 1 ? 'LEAK' : 'LEAKS'}  `))
}
