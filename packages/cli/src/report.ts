import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  htmlReport,
  junitReport,
  markdownComment,
  parseReport,
  type ShakedownReport,
  scoreboard,
} from '@shakedown/reporters'
import { ConfigError, loadConfig } from './config'
import { EXIT } from './exit-codes'
import { OUTPUT_FILES } from './outputs'

export const REPORT_FORMATS = ['html', 'terminal', 'markdown', 'junit', 'json'] as const
export type ReportFormat = (typeof REPORT_FORMATS)[number]

export interface ReportFlags {
  config?: string
  out?: string
  format?: string
  ci?: boolean
}

export interface ReportIo {
  cwd: string
  print: (text: string) => Promise<void> | void
  log: (line: string) => void
  /** Opens a file for a person; false when nobody is watching (CI, a pipe). */
  open?: (file: string) => boolean
}

/**
 * Show the last run again. Every format is rendered from report.json, so this never re-runs
 * anything: `--format markdown` prints the PR comment, `--format terminal` the receipt.
 */
export async function reportCommand(flags: ReportFlags, io: ReportIo): Promise<number> {
  const format = (flags.format ?? 'html') as ReportFormat
  if (!REPORT_FORMATS.includes(format)) {
    io.log(`--format must be one of: ${REPORT_FORMATS.join(', ')}.`)
    return EXIT.config
  }
  const last = await readLastReport(flags, io)
  if (typeof last === 'number') return last
  const { report, dir } = last

  if (format === 'terminal') await io.print(scoreboard(report))
  if (format === 'markdown') await io.print(markdownComment(report))
  if (format === 'junit') await io.print(junitReport(report))
  if (format === 'json') await io.print(JSON.stringify(report, null, 2))
  if (format === 'html') {
    const htmlFile = path.join(dir, OUTPUT_FILES.html)
    if (!existsSync(htmlFile)) writeFileSync(htmlFile, htmlReport(report))
    const opened = !flags.ci && (io.open ?? openFile)(htmlFile)
    io.log(opened ? `Opened ${htmlFile}` : htmlFile)
  }
  return EXIT.pass
}

/** Read the last run's report.json, or explain why there isn't one and return the exit code. */
export async function readLastReport(
  flags: { config?: string; out?: string },
  io: { cwd: string; log: (line: string) => void },
): Promise<{ report: ShakedownReport; dir: string } | number> {
  let outDir = flags.out
  if (!outDir) {
    try {
      outDir = (await loadConfig({ cwd: io.cwd, file: flags.config }))?.config.outDir
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error
      io.log(error.message)
      return EXIT.config
    }
  }
  const dir = path.resolve(io.cwd, outDir ?? '.shakedown')
  const jsonFile = path.join(dir, OUTPUT_FILES.json)
  if (!existsSync(jsonFile)) {
    io.log(
      `No report in ${path.relative(io.cwd, dir) || '.'}. Run "npx @shakedown-dev/cli run" first.`,
    )
    return EXIT.config
  }
  try {
    return { report: parseReport(readFileSync(jsonFile, 'utf8')), dir }
  } catch (error) {
    io.log(`${OUTPUT_FILES.json}: ${(error as Error).message}`)
    return EXIT.config
  }
}

/** Hand the file to the system's opener. Arguments are passed directly, never through a shell. */
export function openFile(file: string): boolean {
  if (!process.stdout.isTTY || process.env.CI) return false
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [file]]
      : process.platform === 'win32'
        ? ['explorer.exe', [file]]
        : ['xdg-open', [file]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
  return true
}
