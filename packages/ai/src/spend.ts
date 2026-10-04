import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** One paid call to Claude. Replayed calls cost nothing and are not written here. */
export interface SpendRecord {
  at: string
  model: string
  purpose: string
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  costUsd: number
  requestId?: string
}

export class AiBudgetError extends Error {
  readonly code = 'AI_BUDGET_EXHAUSTED'

  constructor(message: string) {
    super(message)
    this.name = 'AiBudgetError'
  }
}

/**
 * Where paid calls are written down. The gate reads the total before every call and records each
 * paid one. A file serves one machine; a hosted service with no disk of its own keeps it in its
 * database instead.
 */
export interface SpendStore {
  total(): number | Promise<number>
  record(entry: SpendRecord): void | Promise<void>
}

/**
 * Every paid call, appended to one file shared by every process on this machine (the store,
 * the CLI, the eval), so the cap holds across all of them together.
 */
export class SpendLedger implements SpendStore {
  constructor(readonly file: string) {}

  records(): SpendRecord[] {
    if (!existsSync(this.file)) return []
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as SpendRecord]
        } catch {
          return []
        }
      })
  }

  total(): number {
    return this.records().reduce((sum, record) => sum + record.costUsd, 0)
  }

  record(entry: SpendRecord): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    appendFileSync(this.file, `${JSON.stringify(entry)}\n`)
  }

  summary() {
    const records = this.records()
    const byPurpose: Record<string, { calls: number; costUsd: number }> = {}
    for (const record of records) {
      const bucket = byPurpose[record.purpose] ?? { calls: 0, costUsd: 0 }
      byPurpose[record.purpose] = bucket
      bucket.calls += 1
      bucket.costUsd += record.costUsd
    }
    return { calls: records.length, costUsd: this.total(), byPurpose }
  }
}
