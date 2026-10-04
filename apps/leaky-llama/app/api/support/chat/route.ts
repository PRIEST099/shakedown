import { createClaude } from '@shakedown/ai'
import { type ChatTurn, createLulu, DEFAULT_MODEL, type Effort } from '@shakedown/support-bot'
import { claudeConfigured } from '@/lib/anthropic'
import { getDb } from '@/lib/db/client'
import { errorResponse, json, readJson } from '@/lib/http'
import { readCookie, resolveMode, VISITOR_COOKIE } from '@/lib/mode'
import { getPayPal } from '@/lib/paypal'
import { chatAllowedFrom, chatLimiter, clientAddress } from '@/lib/rate-limit'
import { supportStore } from '@/lib/support'

const MAX_TURNS = 40
const MAX_CHARS = 2000
const EFFORTS = new Set<Effort>(['low', 'medium', 'high'])

/** Only plain text turns are accepted: tool calls and results never come from the browser. */
function readTurns(input: unknown): ChatTurn[] | string {
  if (!Array.isArray(input) || input.length === 0) return 'Send at least one message.'
  if (input.length > MAX_TURNS) return 'This conversation is too long. Start a new one.'
  const turns: ChatTurn[] = []
  for (const turn of input) {
    const role = (turn as ChatTurn)?.role
    const content = (turn as ChatTurn)?.content
    if (
      (role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string' ||
      !content.trim()
    ) {
      return 'Each message needs a role and some text.'
    }
    if (content.length > MAX_CHARS) return `Keep messages under ${MAX_CHARS} characters.`
    turns.push({ role, content })
  }
  if (turns[0]?.role !== 'user' || turns.at(-1)?.role !== 'user') {
    return 'A conversation starts and ends with the customer.'
  }
  return turns
}

/** Talk to Lulu. The Policy Lawyer switch decides how Lulu's refund tool is wired. */
export async function POST(request: Request) {
  try {
    if (!claudeConfigured()) {
      return json(
        {
          error:
            "Lulu isn't connected yet. Add ANTHROPIC_API_KEY to .env.local and restart the store.",
        },
        { status: 503 },
      )
    }
    const { mode, campaignId } = await resolveMode(request)
    const who =
      campaignId ??
      readCookie(request.headers.get('cookie'), VISITOR_COOKIE) ??
      clientAddress(request)
    if (!chatLimiter().allow(who) || (!campaignId && !chatAllowedFrom(request))) {
      return json(
        { error: 'Lulu needs a short break. Try again in a few minutes.' },
        { status: 429 },
      )
    }

    const body = await readJson<{ messages?: unknown }>(request)
    const turns = readTurns(body.messages)
    if (typeof turns === 'string') return json({ error: turns }, { status: 400 })

    const wiring = mode['policy-lawyer']
    const effort = process.env.LULU_EFFORT as Effort
    const lulu = createLulu({
      // Metered, capped and replayable, like every other Claude call in the project.
      client: createClaude({ purpose: 'lulu' }),
      store: supportStore({ db: await getDb(), paypal: getPayPal() }),
      wiring,
      paypal: {
        clientId: process.env.PAYPAL_CLIENT_ID ?? '',
        clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
      },
      model: process.env.LULU_MODEL?.trim() || DEFAULT_MODEL,
      effort: EFFORTS.has(effort) ? effort : undefined,
    })
    const result = await lulu.reply(turns)
    return json({
      reply: result.reply,
      wiring,
      model: result.model,
      toolCalls: result.toolCalls.map((call) => ({
        name: call.name,
        input: call.input,
        output: call.output.slice(0, 2000),
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
