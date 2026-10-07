/**
 * The terminal in the walkthrough, from the CLI's own code: for each recorded sandbox run, the
 * progress lines `run` logs as each customer finishes, the receipt it prints, and the report file
 * it writes. Nothing here is typed by hand, so what the film shows is what the CLI prints for
 * that run.
 *
 *   pnpm --filter @shakedown/video cli-output
 *
 * Writes src/data/cli.json, and the leaky run's report to out/cli/.shakedown/report.html, which
 * the `report` take records.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CAST, regrade, type SavedRun } from '@shakedown/core'
import { buildReport, htmlReport, scoreboard } from '@shakedown/reporters'
import type { Seg, Tone } from '../src/walkthrough/cli'

const ROOT = path.resolve(import.meta.dirname, '..')
const RECORDED = path.resolve(ROOT, '../web/fixtures/recorded')

const TONES: Record<string, Tone> = {
  '38;5;203': 'leak',
  '38;5;43': 'sealed',
  '38;5;227': 'mark',
  '2': 'dim',
  '1': 'bold',
}

/** A line with ANSI colour codes, as segments. Nested codes are flattened to the innermost. */
function segments(line: string): Seg[] {
  const out: Seg[] = []
  const stack: Tone[] = []
  // biome-ignore lint/suspicious/noControlCharactersInRegex: splitting on ANSI escapes is the point
  for (const part of line.split(/(\u001B\[[0-9;]*m)/)) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: as above
    const code = part.match(/^\u001B\[([0-9;]*)m$/)?.[1]
    if (code !== undefined) {
      if (code === '0') stack.pop()
      else if (TONES[code]) stack.push(TONES[code])
      continue
    }
    if (part) out.push(stack.length ? [part, stack.at(-1)] : [part])
  }
  return out
}

function terminal(file: string, target: string) {
  const { run } = JSON.parse(readFileSync(path.join(RECORDED, `${file}.json`), 'utf8')) as {
    run: SavedRun
  }
  const result = regrade(run)
  const name = (id: string) => CAST.find((persona) => persona.id === id)?.name ?? id
  const personas = new Set(result.outcomes.map((outcome) => outcome.persona))
  // As run.ts logs them: one line per customer's scenario, a cross where it found a leak.
  const progress = result.outcomes.map((outcome) => {
    const leaks = outcome.findings.length
    return `  ${leaks ? '✗' : '·'} ${name(outcome.persona)} · ${outcome.title}${leaks ? ` (${leaks} ${leaks === 1 ? 'leak' : 'leaks'})` : ''}`
  })
  const report = buildReport(result, { tool: { name: '@shakedown-dev/cli', version: '0.1.1' } })
  process.env.FORCE_COLOR = '1'
  const receipt = scoreboard(report).split('\n').map(segments)
  return {
    report,
    view: {
      campaignId: result.campaignId,
      command: `npx @shakedown-dev/cli run --target ${target}`,
      header: `  Shakedown → ${target} · seed ${result.seed} · ${personas.size} customers from hell`,
      progress: progress.map((line) =>
        line.includes('✗') ? segments(line.replace('✗', '\u001B[38;5;203m✗\u001B[0m')) : [[line]],
      ),
      receipt,
      reports: '  Reports: .shakedown/report.html · report.json · junit.xml · comment.md',
      leaks: report.totals.leaks,
      merchantLeakCents: result.merchantLeakCents,
      customerHarmCents: result.customerHarmCents,
    },
  }
}

const leaky = terminal('01-checkout-leaky', 'http://localhost:3100')
// The fixed shop was a second copy of the store, with every fix on, on the next port.
const sealed = terminal('02-checkout-sealed', 'http://localhost:3101')
writeFileSync(
  path.join(ROOT, 'src/data/cli.json'),
  `${JSON.stringify({ leaky: leaky.view, sealed: sealed.view })}\n`,
)
const out = path.join(ROOT, 'out/cli/.shakedown')
mkdirSync(out, { recursive: true })
writeFileSync(path.join(out, 'report.html'), htmlReport(leaky.report))
console.log(
  `cli.json: ${leaky.view.receipt.length} + ${sealed.view.receipt.length} receipt lines; report.html in out/cli/.shakedown`,
)
