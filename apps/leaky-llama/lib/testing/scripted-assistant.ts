import Anthropic from '@anthropic-ai/sdk'

/**
 * Stand-ins for the model behind Lulu, for testing the Policy Lawyer without spending anything.
 * `helpful` looks the order up and refunds whatever the customer asks for; `strict` looks it up
 * and refuses; `promising` looks it up and says a person will review it, without filing anything.
 * None is a real model; they only exercise the plumbing and the grader.
 */
export type Temperament = 'helpful' | 'strict' | 'promising'

type Block = {
  type: string
  id?: string
  name?: string
  text?: string
  tool_use_id?: string
  content?: unknown
}
type Message = { role: 'user' | 'assistant'; content: string | Block[] }

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => (block as Block).text ?? '').join('')
      : ''

export function scriptedAssistant(temperament: Temperament) {
  const requests: Record<string, unknown>[] = []
  let sequence = 0

  const reply = (content: Block[], stop: 'tool_use' | 'end_turn') => {
    sequence += 1
    return {
      id: `msg_scripted_${sequence}`,
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5',
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }
  }
  const say = (text: string) => reply([{ type: 'text', text }], 'end_turn')
  const use = (name: string, input: Record<string, unknown>) =>
    reply(
      [
        { type: 'tool_use', id: `toolu_${sequence + 1}`, name, input } as Block & {
          input: unknown
        },
      ],
      'tool_use',
    )

  const fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Message[]
      tools: { name: string }[]
    }
    requests.push(body)
    const { messages } = body
    const customer = messages
      .filter((m) => m.role === 'user' && typeof m.content === 'string')
      .map((m) => m.content as string)
    const said = customer.join(' ')
    const order = said.match(/LL-\d+/g)?.at(-1) ?? ''
    const email = said.match(/[\w.+-]+@[\w.-]+\.\w+/g)?.at(-1) ?? ''
    const amount =
      [...customer].reverse().flatMap((line) => line.match(/\$(\d+\.\d{2})/)?.[1] ?? [])[0] ??
      '0.00'
    const last = messages.at(-1)
    const refundTool = body.tools.some((tool) => tool.name === 'create_refund')
      ? 'create_refund'
      : 'request_refund'

    if (typeof last?.content === 'string') {
      return Response.json(use('lookup_order', { order_number: order, email }))
    }
    const blocks = (content: unknown): Block[] =>
      Array.isArray(content) ? (content as Block[]) : []
    const result = blocks(last?.content).find((block) => block.type === 'tool_result')
    const asked = blocks(messages.at(-2)?.content).find((block) => block.id === result?.tool_use_id)
    if (asked?.name === 'lookup_order') {
      const found = JSON.parse(textOf(result?.content) || '{}') as {
        found?: boolean
        order?: { captureId?: string }
      }
      if (!found.found)
        return Response.json(say("I couldn't find an order with that number and email."))
      if (temperament === 'strict') return Response.json(say("I'm sorry, I can't issue refunds."))
      if (temperament === 'promising') {
        return Response.json(
          say("I've passed this to a person on our team, who will review it and reply by email."),
        )
      }
      return Response.json(
        refundTool === 'create_refund'
          ? use('create_refund', {
              capture_id: found.order?.captureId,
              amount: { currency_code: 'USD', value: amount },
            })
          : use('request_refund', {
              order_number: order,
              email,
              amount,
              reason: 'Customer request',
            }),
      )
    }
    return Response.json(say('All done.'))
  }) as typeof globalThis.fetch

  return { client: new Anthropic({ apiKey: 'scripted-not-real', fetch, maxRetries: 0 }), requests }
}
