import { budgetUsd, createClaude, spendLedger } from '@shakedown/ai'
import type { AgLlmRequest } from 'ag-studio'
import { failedTurn, fromClaudeMessage, toClaudeRequest } from '../../../../lib/console/claude-turn'
import { fromConsole, json, underLimit } from '../../../../lib/console/guard'

export const dynamic = 'force-dynamic'

/** A turn's request can carry a long conversation, but never megabytes. */
const MAX_BODY = 600_000

/** The console's own share of the machine-wide budget, all-time, across restarts. */
function consoleBudgetUsd(): number {
  const configured = Number(process.env.SHAKEDOWN_CONSOLE_AI_BUDGET_USD)
  const cap = Number.isFinite(configured) && configured >= 0 ? configured : 0.25
  const ledger = spendLedger()
  const spent = ledger.summary().byPurpose.console?.costUsd ?? 0
  return Math.min(budgetUsd(), ledger.total() + Math.max(0, cap - spent))
}

/**
 * One agent turn for the console, answered by Claude. Every call goes through Shakedown's spend
 * gate: a hard cap checked before anything is sent, a replay cache, and the shared spend log.
 * The model is pinned server-side, whatever the page asks for.
 */
export async function POST(request: Request) {
  if (!fromConsole(request)) return json({ error: 'Console only.' }, 403)
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return json(failedTurn('no_key', 'Triage needs ANTHROPIC_API_KEY on the server.'))
  }
  if (!underLimit(request, 'llm', 60, 10 * 60_000)) {
    return json(failedTurn('rate_limited', 'Too many turns. Try again in a few minutes.'))
  }
  const raw = await request.text()
  if (raw.length > MAX_BODY) return json(failedTurn('too_long', 'This conversation is too long.'))

  let body: AgLlmRequest
  try {
    body = JSON.parse(raw) as AgLlmRequest
  } catch {
    return json({ error: 'Not JSON.' }, 400)
  }
  const claude = createClaude({ purpose: 'console', budgetUsd: consoleBudgetUsd() })
  try {
    const message = await claude.messages.create(toClaudeRequest(body), { signal: request.signal })
    return json(fromClaudeMessage(message))
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 402) {
      return json(
        failedTurn('budget_exhausted', "Shakedown's AI budget for this machine is used up."),
      )
    }
    return json(failedTurn('provider_error', (error as Error).message))
  }
}
