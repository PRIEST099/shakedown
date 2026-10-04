import { budgetUsd, type SpendRecord, type SpendStore, spendLedger } from '@shakedown/ai'
import { aiSpend, type Database } from '@shakedown/core/db'
import { eq, sql } from 'drizzle-orm'
import { getConsoleDb } from './store'

/**
 * Paid Claude calls kept in the campaign store. A hosted web service has no disk that survives a
 * deploy, so a file would forget what was spent and the cap with it.
 */
export function databaseSpend(
  db: Database,
): SpendStore & { spentOn(purpose: string): Promise<number> } {
  const sum = async (purpose?: string) => {
    const [row] = await db
      .select({ micros: sql<string>`coalesce(sum(${aiSpend.costMicros}), 0)` })
      .from(aiSpend)
      .where(purpose ? eq(aiSpend.purpose, purpose) : undefined)
    return Number(row?.micros ?? 0) / 1_000_000
  }
  return {
    total: () => sum(),
    spentOn: (purpose) => sum(purpose),
    async record(entry: SpendRecord) {
      await db.insert(aiSpend).values({
        at: new Date(entry.at),
        model: entry.model,
        purpose: entry.purpose,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        cacheReadTokens: entry.cacheReadTokens,
        costMicros: Math.round(entry.costUsd * 1_000_000),
        requestId: entry.requestId ?? null,
      })
    },
  }
}

/** The console's cap, all-time, in US dollars. */
export function consoleCapUsd(): number {
  const configured = Number(process.env.SHAKEDOWN_CONSOLE_AI_BUDGET_USD)
  return Number.isFinite(configured) && configured >= 0 ? configured : 0.25
}

/**
 * Where the console's Claude spend is written, and the budget the gate checks it against: the
 * console's share of the machine-wide budget locally, or its own cap in its database when hosted.
 */
export async function consoleSpend(): Promise<{ spend?: SpendStore; budgetUsd: number }> {
  const cap = consoleCapUsd()
  if (process.env.CONSOLE_DATABASE_URL?.trim()) {
    const spend = databaseSpend(await getConsoleDb())
    const [total, spent] = await Promise.all([spend.total(), spend.spentOn('console')])
    return { spend, budgetUsd: Math.min(budgetUsd(), total + Math.max(0, cap - spent)) }
  }
  const ledger = spendLedger()
  const spent = ledger.summary().byPurpose.console?.costUsd ?? 0
  return { budgetUsd: Math.min(budgetUsd(), ledger.total() + Math.max(0, cap - spent)) }
}
