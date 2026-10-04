import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { SavedRun } from '@shakedown/core'
import {
  htmlReport,
  junitReport,
  markdownComment,
  type ShakedownReport,
} from '@shakedown/reporters'

/** The files a run leaves behind. Everything but `run.json` is rendered from `report.json`. */
export const OUTPUT_FILES = {
  json: 'report.json',
  html: 'report.html',
  junit: 'junit.xml',
  markdown: 'comment.md',
  ledger: 'run.json',
} as const

export function writeOutputs(dir: string, report: ShakedownReport, saved: SavedRun): string[] {
  mkdirSync(dir, { recursive: true })
  const files: [string, string][] = [
    [OUTPUT_FILES.json, `${JSON.stringify(report, null, 2)}\n`],
    [OUTPUT_FILES.html, htmlReport(report)],
    [OUTPUT_FILES.junit, junitReport(report)],
    [OUTPUT_FILES.markdown, markdownComment(report)],
    // The ledger, so a fixed grader can judge this run again without re-running it.
    [OUTPUT_FILES.ledger, `${JSON.stringify(saved)}\n`],
  ]
  for (const [name, content] of files) writeFileSync(path.join(dir, name), content)
  return files.map(([name]) => path.join(dir, name))
}
