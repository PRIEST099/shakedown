import { createClaude } from '@shakedown/ai'
import type { AgLlmRequest } from 'ag-studio'
import { failedTurn, fromClaudeMessage, toClaudeRequest } from '../../../../lib/console/claude-turn'
import { fromConsole, json, underLimit } from '../../../../lib/console/guard'
import { judgeMode } from '../../../../lib/console/live'
import { consoleSpend } from '../../../../lib/console/spend'

export const dynamic = 'force-dynamic'

/** A turn's request can carry a long conversation, but never megabytes. */
const MAX_BODY = 600_000

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
  // Hosted for judges, one visitor gets fewer turns: the console's cap is shared by everyone.
  if (!underLimit(request, 'llm', judgeMode() ? 20 : 60, 10 * 60_000)) {
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
  const claude = createClaude({ purpose: 'console', ...(await consoleSpend()) })
  try {
    const message = await claude.messages.create(toClaudeRequest(body), { signal: request.signal })
    return json(fromClaudeMessage(message))
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 402) {
      return json(failedTurn('budget_exhausted', "The console's AI budget is used up."))
    }
    return json(failedTurn('provider_error', (error as Error).message))
  }
}
