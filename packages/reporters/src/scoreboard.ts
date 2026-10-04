import type { CampaignResult } from '@shakedown/core'
import { ink } from './ansi'
import {
  buildReport,
  type Explanation,
  money,
  type ReportCheck,
  type ReportPersona,
  type ShakedownReport,
} from './report'

export type { Explanation } from './report'

/**
 * The receipt. One line per property tested, red where money can leave and sealed where it
 * cannot, then the totals at the bottom. Rendered from the JSON report, like every other format.
 */

const WIDTH = 66
const rule = (char = '─') => char.repeat(WIDTH)

/** Length without the ANSI escapes, so columns still line up when colour is on. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes is the point
const visibleLength = (text: string) => text.replace(/\u001B\[[0-9;]*m/g, '').length

const pad = (left: string, right: string, width = WIDTH) => {
  const gap = Math.max(1, width - visibleLength(left) - visibleLength(right))
  return `${left}${' '.repeat(gap)}${right}`
}

function wrapText(text: string, width: number, indent: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
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

const personaHeading = (persona: ReportPersona) =>
  pad(ink.bold(`${persona.number}. ${persona.name.toUpperCase()}`), ink.dim(persona.channel))

/** Whose money a finding puts at risk. Merchant loss and customer harm are never added together. */
function atRisk(check: ReportCheck): string {
  const parts: string[] = []
  if (check.merchantLeakCents > 0) parts.push(`${money(check.merchantLeakCents)} merchant`)
  if (check.customerHarmCents > 0) parts.push(`${money(check.customerHarmCents)} customer`)
  return parts.length ? ink.leak(parts.join(' · ')) : ink.dim('$0.00 this time')
}

function leakBlock(check: ReportCheck): string[] {
  const lines = [`  ${ink.leak('✗')} ${ink.bold(check.title)}`]
  lines.push(...wrapText(check.detail, WIDTH - 6, '    '))
  if (check.explanation) {
    lines.push('')
    lines.push(`    ${ink.mark('In plain words')} ${ink.dim('(written by the AI layer)')}`)
    lines.push(...wrapText(check.explanation.explanation, WIDTH - 6, '    '))
  }
  lines.push('')
  for (const item of check.evidence)
    lines.push(`    ${ink.dim(item.label.padEnd(28))}${item.value}`)
  lines.push(`    ${ink.dim('At risk'.padEnd(28))}${atRisk(check)}`)
  if (check.fix) {
    lines.push('')
    const [first, ...rest] = wrapText(`Fix: ${check.fix}`, WIDTH - 6, '    ')
    if (first) lines.push(first.replace('Fix:', ink.mark('Fix:')))
    lines.push(...rest)
  }
  return lines
}

export interface ScoreboardOptions {
  /** Show the properties that held, not just the ones that did not. */
  showSealed?: boolean
  /** Plain-language explanations, by finding ID, when rendering a live result. */
  explanations?: Readonly<Record<string, Explanation>>
}

const isReport = (input: ShakedownReport | CampaignResult): input is ShakedownReport =>
  'schema' in input

export function scoreboard(
  input: ShakedownReport | CampaignResult,
  options: ScoreboardOptions = {},
): string {
  const report = isReport(input)
    ? input
    : buildReport(input, { explanations: options.explanations })
  const showSealed = options.showSealed ?? true
  const lines: string[] = ['', ink.bold('  SHAKEDOWN'), `  ${ink.dim('The returns desk')}`, '']
  lines.push(`  ${rule()}`)
  lines.push(`  ${pad(ink.dim('Target'), report.campaign.target)}`)
  lines.push(`  ${pad(ink.dim('Campaign'), report.campaign.id)}`)
  lines.push(`  ${pad(ink.dim('Seed'), String(report.campaign.seed))}`)
  lines.push(`  ${rule()}`)

  for (const persona of report.personas) {
    lines.push('', `  ${personaHeading(persona)}`, '')
    for (const scenario of persona.scenarios) {
      if (scenario.skipped) {
        lines.push(
          `  ${ink.dim('–')} ${scenario.title}${ink.dim(` (skipped: ${scenario.skipped})`)}`,
        )
        continue
      }
      for (const check of scenario.checks) {
        if (check.verdict === 'leak') continue
        if (check.verdict === 'sealed' && !showSealed) continue
        const mark = check.verdict === 'sealed' ? ink.sealed('✓') : ink.dim('·')
        const note = check.verdict === 'sealed' ? '' : ink.dim(' (inconclusive)')
        lines.push(`  ${mark} ${check.title}${note}`)
        // Inconclusive means a person should look, so say what Shakedown saw.
        if (check.verdict === 'inconclusive') {
          lines.push(...wrapText(check.detail, WIDTH - 6, '    ').map((line) => ink.dim(line)))
        }
      }
      for (const check of scenario.checks.filter((entry) => entry.verdict === 'leak')) {
        lines.push('', ...leakBlock(check))
      }
      if (scenario.error) lines.push(`  ${ink.dim(`! ${scenario.error}`)}`)
    }
  }

  const total = (cents: number) =>
    cents > 0 ? ink.leak(ink.bold(money(cents))) : ink.sealed(ink.bold(money(0)))
  const { totals } = report
  lines.push('', `  ${rule()}`)
  lines.push(`  ${pad(ink.bold('MERCHANT LEAK'), total(totals.merchantLeakCents))}`)
  lines.push(`  ${pad(ink.dim('  goods or money out, nothing in'), '')}`)
  lines.push(`  ${pad(ink.bold('CUSTOMER HARM'), total(totals.customerHarmCents))}`)
  lines.push(`  ${pad(ink.dim('  customers charged for nothing'), '')}`)
  lines.push(`  ${rule()}`)
  const notes = [
    totals.inconclusive && `${totals.inconclusive} inconclusive`,
    totals.skipped && `${totals.skipped} skipped`,
    report.ai && `Claude spend $${report.ai.spentUsd.toFixed(4)}`,
  ].filter(Boolean)
  if (notes.length) lines.push(`  ${ink.dim(notes.join(' · '))}`)
  lines.push('')
  lines.push(
    `  ${
      totals.leaks === 0
        ? ink.sealed(ink.invert('  SEALED  '))
        : ink.leak(ink.invert(`  ${totals.leaks} ${totals.leaks === 1 ? 'LEAK' : 'LEAKS'}  `))
    }`,
  )
  if (report.campaign.stoppedEarly)
    lines.push('', `  ${ink.dim(`Stopped early: ${report.campaign.stoppedEarly}`)}`)
  lines.push('')
  return lines.join('\n')
}
