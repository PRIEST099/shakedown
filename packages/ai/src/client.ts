import { existsSync } from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { claudeGate } from './gate'
import { SpendLedger } from './spend'

/**
 * Where Shakedown keeps its AI spend log and replay cache: `.data` at the repo root, found by
 * walking up to pnpm-workspace.yaml, so the store, the CLI and the eval all share one budget.
 */
export function dataDir(): string {
  if (process.env.SHAKEDOWN_DATA_DIR?.trim()) return path.resolve(process.env.SHAKEDOWN_DATA_DIR)
  let dir = process.cwd()
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return path.join(dir, '.data')
    const parent = path.dirname(dir)
    if (parent === dir) return path.join(process.cwd(), '.data')
    dir = parent
  }
}

/** Phase 5's development budget. The account behind the key holds $5, so most of it is kept back. */
export const DEFAULT_BUDGET_USD = 1.5

export function budgetUsd(): number {
  const configured = Number(process.env.SHAKEDOWN_AI_BUDGET_USD)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BUDGET_USD
}

export const spendLedger = (dir = dataDir()) => new SpendLedger(path.join(dir, 'ai-spend.jsonl'))

export interface ClaudeOptions {
  /** A label for the spend log, e.g. 'lulu'. */
  purpose: string
  dir?: string
  budgetUsd?: number
  /** false switches the replay cache off, e.g. for a deliberately fresh measurement. */
  replay?: boolean
  apiKey?: string
  /** The real transport. Tests pass a fake one. */
  fetch?: typeof fetch
  log?: (line: string) => void
}

/** The only way Shakedown should talk to Claude: metered, capped and replayable. */
export function createClaude(options: ClaudeOptions): Anthropic {
  const dir = options.dir ?? dataDir()
  // An organisation-level key must say which workspace to bill.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  return new Anthropic({
    apiKey: options.apiKey,
    defaultHeaders: workspace ? { 'anthropic-workspace-id': workspace } : undefined,
    // One retry for a transient 429 or 5xx; a retried call that succeeds is billed once.
    maxRetries: 1,
    fetch: claudeGate({
      spend: spendLedger(dir),
      budgetUsd: options.budgetUsd ?? budgetUsd(),
      cacheDir: options.replay === false ? null : path.join(dir, 'ai-cache'),
      purpose: options.purpose,
      fetch: options.fetch,
      log: options.log,
    }),
  })
}
