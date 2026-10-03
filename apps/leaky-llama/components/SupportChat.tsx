'use client'

import { useRef, useState } from 'react'
import { LlamaMark } from './LlamaMark'

interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output: string
}

interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
}

const GREETING: Turn = {
  id: 'greeting',
  role: 'assistant',
  content: "Hi, I'm Lulu. I can look up an order or help with a refund. What can I do for you?",
}

/** One line per tool call, so a demo shows what Lulu actually did, not just what it said. */
function describe(call: ToolCall): string {
  const output = (() => {
    try {
      return JSON.parse(call.output) as Record<string, unknown>
    } catch {
      return {}
    }
  })()
  if (call.name === 'lookup_order') {
    return output.found
      ? `Looked up ${String(call.input.order_number)}`
      : 'Lookup found no matching order'
  }
  if (call.name === 'request_refund') {
    return `Asked the store for a $${String(call.input.amount)} refund: ${String(output.decision ?? 'error')}`
  }
  if (call.name === 'create_refund') {
    const amount = (call.input.amount as { value?: string } | undefined)?.value
    return output.id
      ? `Refunded ${amount ? `$${amount}` : 'the full amount'} directly at PayPal (${String(output.id)})`
      : `Tried a direct PayPal refund: ${String(output.error ?? output.message ?? 'failed')}`
  }
  return call.name
}

export function SupportChat({
  wiring,
  connected,
}: {
  wiring: 'leaky' | 'sealed'
  connected: boolean
}) {
  const [turns, setTurns] = useState<Turn[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    const next: Turn[] = [...turns, { id: crypto.randomUUID(), role: 'user', content: text }]
    setTurns(next)
    setDraft('')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The greeting is ours, not Claude's: the conversation sent starts with the customer.
        body: JSON.stringify({
          messages: next.slice(1).map((turn) => ({ role: turn.role, content: turn.content })),
        }),
      })
      const body = (await res.json()) as {
        reply?: string
        toolCalls?: Omit<ToolCall, 'id'>[]
        error?: string
      }
      if (!res.ok || !body.reply) throw new Error(body.error ?? 'Lulu could not answer.')
      setTurns([
        ...next,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: body.reply,
          toolCalls: body.toolCalls?.map((call) => ({ ...call, id: crypto.randomUUID() })),
        },
      ])
    } catch (caught) {
      setError((caught as Error).message)
      setTurns(turns)
      setDraft(text)
    } finally {
      setBusy(false)
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <p className="bg-night px-4 py-2 font-mono text-[11px] leading-relaxed text-sand/80">
        <span className={wiring === 'leaky' ? 'text-leak' : 'text-seal'}>
          POLICY LAWYER SWITCH: {wiring.toUpperCase()}
        </span>{' '}
        ·{' '}
        {wiring === 'leaky'
          ? "Lulu holds PayPal's create_refund tool directly. The policy lives only in the prompt."
          : 'Lulu can only ask the store, which applies the policy in code.'}
      </p>

      <div className="max-h-[28rem] space-y-4 overflow-y-auto p-5" aria-live="polite">
        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
            {turn.role === 'assistant' && <LlamaMark className="mt-1 h-8 w-8 shrink-0" />}
            <div className="max-w-[80%]">
              <p
                className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  turn.role === 'user' ? 'bg-moss text-sand' : 'bg-sand text-ink'
                }`}
              >
                {turn.content}
              </p>
              {turn.toolCalls && turn.toolCalls.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {turn.toolCalls.map((call) => (
                    <li key={call.id} className="font-mono text-[11px] text-stone">
                      ↳ {describe(call)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-3">
            <LlamaMark className="h-8 w-8 shrink-0" />
            <p className="rounded-2xl bg-sand px-4 py-2.5 text-sm text-stone">Lulu is checking…</p>
          </div>
        )}
        <div ref={end} />
      </div>

      {error && (
        <p role="alert" className="mx-5 mb-3 rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">
          {error}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
        className="flex gap-2 border-t border-line p-3"
      >
        <label htmlFor="message" className="sr-only">
          Message Lulu
        </label>
        <input
          id="message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={connected ? 'Ask about an order or a refund…' : 'Lulu is not connected yet'}
          disabled={!connected}
          maxLength={2000}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-line bg-sand/40 px-4 py-2.5 text-sm disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!connected || busy || !draft.trim()}
          className="rounded-full bg-moss px-5 py-2.5 text-sm font-semibold text-sand hover:bg-moss-dark disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
