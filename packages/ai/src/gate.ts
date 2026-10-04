import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Usage } from './prices'
import { costOf, priceOf, worstCaseCost } from './prices'
import type { SpendStore } from './spend'

/**
 * The spend gate. Every request to the Messages API goes through it, whichever SDK helper made
 * it, and it does three things:
 *
 * 1. Replays: an identical request is answered from disk for $0, so a re-run costs nothing.
 * 2. Caps: before anything is sent, the worst case it could cost is checked against what is
 *    left of the budget. Over the line, the request is refused without reaching the network.
 * 3. Meters: every paid response is priced from the usage it reports and written down.
 */
export interface GateOptions {
  spend: SpendStore
  budgetUsd: number
  /** Where replayed responses live. null switches the replay cache off. */
  cacheDir: string | null
  /** A label for the spend log, e.g. 'lulu' or 'policy-compiler'. */
  purpose: string
  fetch?: typeof fetch
  log?: (line: string) => void
}

const MESSAGES_PATH = /\/v1\/messages$/

/** JSON with every object's keys sorted, so the same request always hashes the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const refuse = (status: number, type: string, message: string) =>
  new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'refused-by-spend-gate' },
  })

export function claudeGate(options: GateOptions): typeof fetch {
  const transport = options.fetch ?? globalThis.fetch
  const log = options.log ?? (() => {})

  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    // Only message creation costs money; token counting and everything else pass straight through.
    if (method !== 'POST' || !MESSAGES_PATH.test(new URL(url).pathname))
      return transport(input, init)

    const raw = typeof init?.body === 'string' ? init.body : undefined
    if (!raw)
      return refuse(400, 'invalid_request_error', 'The spend gate needs a JSON body it can read.')
    const body = JSON.parse(raw) as {
      model?: string
      max_tokens?: number
      stream?: boolean
    }
    if (body.stream) {
      return refuse(
        400,
        'invalid_request_error',
        'Streaming is not supported through the spend gate.',
      )
    }
    const model = String(body.model ?? '')
    if (!priceOf(model)) {
      return refuse(
        400,
        'invalid_request_error',
        `No price for ${model}; refusing rather than guessing.`,
      )
    }

    const headers = new Headers(init?.headers)
    const key = createHash('sha256')
      .update(`${headers.get('anthropic-beta') ?? ''}|${canonical(body)}`)
      .digest('hex')
    const cached = options.cacheDir ? path.join(options.cacheDir, `${key}.json`) : undefined

    if (cached && existsSync(cached)) {
      const entry = JSON.parse(readFileSync(cached, 'utf8')) as {
        response: unknown
        requestId?: string
      }
      log(`[ai] replayed ${options.purpose} (${model}) for $0`)
      return new Response(JSON.stringify(entry.response), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'request-id': entry.requestId ?? 'replayed',
        },
      })
    }

    const spent = await options.spend.total()
    const worst = worstCaseCost(model, raw.length, body.max_tokens ?? 0)
    if (spent + worst > options.budgetUsd) {
      log(
        `[ai] refused ${options.purpose}: $${spent.toFixed(4)} spent of $${options.budgetUsd.toFixed(2)}`,
      )
      return refuse(
        402,
        'budget_exhausted',
        `Shakedown's AI budget would be exceeded: $${spent.toFixed(4)} spent of $${options.budgetUsd.toFixed(2)}, and this call could cost up to $${worst.toFixed(4)}. Raise SHAKEDOWN_AI_BUDGET_USD to allow more.`,
      )
    }

    const res = await transport(input, init)
    const text = await res.text()
    const passOn = () =>
      new Response(text, {
        status: res.status,
        headers: {
          'content-type': res.headers.get('content-type') ?? 'application/json',
          'request-id': res.headers.get('request-id') ?? '',
        },
      })
    if (!res.ok) return passOn()

    const message = JSON.parse(text) as { model?: string; usage?: Usage }
    const servedBy = message.model && priceOf(message.model) ? message.model : model
    const usage = message.usage ?? {}
    const costUsd = costOf(servedBy, usage)
    await options.spend.record({
      at: new Date().toISOString(),
      model: servedBy,
      purpose: options.purpose,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      costUsd,
      requestId: res.headers.get('request-id') ?? undefined,
    })
    log(`[ai] paid ${options.purpose} (${servedBy}) $${costUsd.toFixed(5)}`)

    if (cached) {
      mkdirSync(path.dirname(cached), { recursive: true })
      const temp = `${cached}.${process.pid}.tmp`
      writeFileSync(
        temp,
        JSON.stringify({ response: message, requestId: res.headers.get('request-id') }),
      )
      renameSync(temp, cached)
    }
    return passOn()
  }) as typeof fetch
}
