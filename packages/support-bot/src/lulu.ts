import type Anthropic from '@anthropic-ai/sdk'
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk'
import { assertSandboxApiUrl } from '@shakedown/paypal'
import { z } from 'zod'
import { REFUSAL_REPLY, STUCK_REPLY, systemPrompt } from './prompt'
import { CREATE_REFUND_INPUT_SCHEMA } from './toolkit-schema.generated'

/**
 * Lulu, Leaky Llama's support assistant.
 *
 * Two wirings, chosen by the store's Policy Lawyer switch:
 * - leaky: PayPal's agent-toolkit `create_refund` tool goes straight to the model. The written
 *   policy is in the prompt and nowhere else, so the model's judgement is the only check.
 * - sealed: the model gets `request_refund`, which hands the request to the store; the store
 *   applies the policy in code and either refunds, escalates to a person, or declines.
 */

export interface LuluOrder {
  orderNumber: string
  status: string
  items: { name: string; qty: number; unitCents: number }[]
  amountCents: number
  capturedCents: number
  refundedCents: number
  currency: string
  placedAt: string
  /** The PayPal capture behind the order. The toolkit's refund tool needs it. */
  captureId: string | null
  openDispute: boolean
}

export type LookupResult = { found: true; order: LuluOrder } | { found: false; reason: string }

export interface RefundOutcome {
  decision: 'approved' | 'escalated' | 'declined'
  message: string
  refundId?: string
  amountCents?: number
}

export interface LuluStore {
  /** The written refund policy, as the customer sees it on the policy page. */
  policyText: string
  /** Find an order, but only for the email it was placed with. */
  lookupOrder(orderNumber: string, email: string): Promise<LookupResult>
  /** Sealed path: the store applies its policy in code and issues the refund itself. */
  requestRefund(input: {
    orderNumber: string
    email: string
    amountCents: number
    reason: string
  }): Promise<RefundOutcome>
  /** Leaky path: tell the store about a refund the toolkit already issued at PayPal. */
  recordToolkitRefund(input: {
    captureId: string
    refundId: string
    amountCents?: number
  }): Promise<void>
}

/** PayPal's toolkit refund tool, or a stand-in with the same shape for tests. */
export interface ToolkitRefund {
  description: string
  execute(input: Record<string, unknown>): Promise<unknown>
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolCall {
  name: string
  input: unknown
  output: string
}

export interface LuluReply {
  reply: string
  toolCalls: ToolCall[]
  stopReason: string | null
  model: string
}

export type Effort = 'low' | 'medium' | 'high'

export interface LuluOptions {
  client: Anthropic
  store: LuluStore
  wiring: 'leaky' | 'sealed'
  /** Required for the leaky wiring unless `toolkitRefund` is given. */
  paypal?: { clientId: string; clientSecret: string }
  toolkitRefund?: ToolkitRefund
  model?: string
  effort?: Effort
  /** Tool-use round trips allowed per customer message. */
  maxIterations?: number
}

export const DEFAULT_MODEL = 'claude-opus-5'

/**
 * Per-model request options. Effort is set where the model takes it; server-side refusal
 * fallbacks are opted into on the models that can decline a request outright.
 */
export function modelOptions(model: string, effort: Effort) {
  const options: { output_config?: { effort: Effort }; betas?: string[]; fallbacks?: 'default' } =
    {}
  if (/^claude-(opus-5(-5)?|sonnet-5|fable-5(-1)?)$/.test(model)) options.output_config = { effort }
  if (/^claude-(opus-5(-5)?|fable-5-1)$/.test(model)) {
    options.betas = ['server-side-fallback-2026-07-01']
    options.fallbacks = 'default'
  }
  return options
}

/** The real toolkit, limited to the one action Lulu uses, and locked to the sandbox. */
export function payPalToolkitRefund(credentials: {
  clientId: string
  clientSecret: string
}): ToolkitRefund {
  const kit = new PayPalAgentToolkit({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    configuration: { actions: { payments: { createRefund: true } }, context: { sandbox: true } },
  })
  // The toolkit has its own HTTP client; hold it to the same sandbox lock as ours.
  assertSandboxApiUrl(kit.client.getBaseUrl())
  const tool = kit.getTools().create_refund
  if (!tool?.execute) throw new Error('The agent toolkit did not provide create_refund.')
  const execute = tool.execute
  return {
    description: tool.description ?? 'Refund a PayPal capture.',
    execute: async (input) => await execute(input as never, { toolCallId: 'lulu', messages: [] }),
  }
}

const dollars = /^\d{1,7}(\.\d{1,2})?$/
const toCents = (value: string) => Math.round(Number(value) * 100)

const asText = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value))

export function createLulu(options: LuluOptions) {
  const model = options.model ?? DEFAULT_MODEL
  const effort = options.effort ?? 'medium'
  const maxIterations = options.maxIterations ?? 6
  const system = systemPrompt(options.store.policyText)

  const toolkitRefund =
    options.wiring === 'leaky'
      ? (options.toolkitRefund ??
        (options.paypal ? payPalToolkitRefund(options.paypal) : undefined))
      : undefined
  if (options.wiring === 'leaky' && !toolkitRefund) {
    throw new Error('The leaky wiring needs PayPal credentials for the agent toolkit.')
  }

  async function reply(history: ChatTurn[]): Promise<LuluReply> {
    const trace: ToolCall[] = []
    const traced = async (name: string, input: unknown, run: () => Promise<unknown>) => {
      let output: string
      try {
        output = asText(await run())
      } catch (error) {
        output = JSON.stringify({ error: (error as Error).message })
      }
      trace.push({ name, input, output })
      return output
    }

    const lookupOrder = betaZodTool({
      name: 'lookup_order',
      description:
        "Look up a Leaky Llama order by its order number and the email address it was placed with. Returns its status, items, what was paid and refunded, the PayPal capture ID, and whether a dispute is open. Returns found: false when the number and email don't match an order.",
      inputSchema: z.object({
        order_number: z.string().describe('Like LL-10042'),
        email: z.string().describe('The email address the order was placed with'),
      }),
      run: (input) =>
        traced('lookup_order', input, () =>
          options.store.lookupOrder(input.order_number, input.email),
        ),
    })

    const refundTool =
      options.wiring === 'sealed'
        ? betaZodTool({
            name: 'request_refund',
            description:
              'Ask the store to refund some or all of an order. The store checks its refund policy and answers approved (the refund was issued), escalated (a person will decide) or declined (with the reason). Pass the amount in US dollars, like "18.00".',
            inputSchema: z.object({
              order_number: z.string(),
              email: z.string(),
              amount: z.string().regex(dollars).describe('US dollars, like "18.00"'),
              reason: z.string().describe("The customer's reason, in a sentence"),
            }),
            run: (input) =>
              traced('request_refund', input, () =>
                options.store.requestRefund({
                  orderNumber: input.order_number,
                  email: input.email,
                  amountCents: toCents(input.amount),
                  reason: input.reason,
                }),
              ),
          })
        : betaTool({
            name: 'create_refund',
            description: (toolkitRefund as ToolkitRefund).description,
            inputSchema: CREATE_REFUND_INPUT_SCHEMA,
            run: (input) =>
              traced('create_refund', input, async () => {
                const args = input as {
                  capture_id: string
                  amount?: { currency_code: string; value: string }
                }
                const result = await (toolkitRefund as ToolkitRefund).execute(
                  input as Record<string, unknown>,
                )
                const refund = (typeof result === 'string' ? safeParse(result) : result) as {
                  id?: string
                  amount?: { value?: string }
                }
                if (refund?.id) {
                  const value = refund.amount?.value ?? args.amount?.value
                  await options.store.recordToolkitRefund({
                    captureId: args.capture_id,
                    refundId: refund.id,
                    amountCents: value ? toCents(value) : undefined,
                  })
                }
                return result
              }),
          })

    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }))

    const final = await options.client.beta.messages.toolRunner({
      model,
      max_tokens: 16000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [lookupOrder, refundTool],
      messages,
      max_iterations: maxIterations,
      ...modelOptions(model, effort),
    })

    if (final.stop_reason === 'refusal') {
      return {
        reply: REFUSAL_REPLY,
        toolCalls: trace,
        stopReason: final.stop_reason,
        model: final.model,
      }
    }
    const text = final.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    return {
      reply: text || STUCK_REPLY,
      toolCalls: trace,
      stopReason: final.stop_reason,
      model: final.model,
    }
  }

  return { reply, model, wiring: options.wiring, system }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
