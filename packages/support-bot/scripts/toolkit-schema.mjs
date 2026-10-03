// Converts the agent toolkit's create_refund parameters (zod v3) to JSON Schema exactly the way
// AI SDK v4 does when it hands the tool to a model, using the toolkit's own copy of `ai`.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const kitEntry = require.resolve('@paypal/agent-toolkit/ai-sdk')
const fromKit = createRequire(kitEntry)
const { PayPalAgentToolkit } = require('@paypal/agent-toolkit/ai-sdk')
const { zodSchema } = fromKit('ai')

export function createRefundSchema() {
  const kit = new PayPalAgentToolkit({
    clientId: 'schema-only',
    clientSecret: 'schema-only',
    configuration: { actions: { payments: { createRefund: true } }, context: { sandbox: true } },
  })
  const { $schema: _draft, ...schema } = zodSchema(
    kit.getTools().create_refund.parameters,
  ).jsonSchema
  return schema
}
