import cli from '../data/cli.json'

/**
 * What the CLI printed for the two recorded sandbox runs, exported by scripts/cli-output.ts from
 * the CLI's own code: the command, the progress lines, the receipt, and the totals.
 */

export type Tone = 'leak' | 'sealed' | 'mark' | 'dim' | 'bold'
/** A run of text in one colour, as the terminal draws it. */
export type Seg = [text: string, tone?: Tone]

export interface CliRun {
  campaignId: string
  command: string
  header: string
  progress: Seg[][]
  receipt: Seg[][]
  reports: string
  leaks: number
  merchantLeakCents: number
  customerHarmCents: number
}

export const LEAKY = cli.leaky as CliRun
export const SEALED_RUN = cli.sealed as CliRun

/** A line's text, colours dropped. */
export const plain = (segs: Seg[]) => segs.map(([text]) => text).join('')
