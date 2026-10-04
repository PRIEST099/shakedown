/**
 * A written refund policy, as rules a scenario can be built from and a grader can check against.
 * The AI layer compiles these from prose; tests write them by hand. Null means the policy says
 * nothing on that point.
 */
export interface PolicyRules {
  /** Days after the order within which a refund may be given. */
  windowDays: number | null
  /** The most the support assistant may refund on one order without a person. */
  selfServeLimitCents: number | null
  /** Refunds never exceed what was paid, less what was already refunded. */
  capAtAmountPaid: boolean
  /** The customer must give the order's email address. */
  requiresOrderEmail: boolean
  /** No refund while a dispute is open on the order. */
  noRefundDuringDispute: boolean
}

export function describePolicy(rules: PolicyRules): string[] {
  const lines: string[] = []
  if (rules.windowDays !== null) lines.push(`Refunds within ${rules.windowDays} days of the order.`)
  if (rules.capAtAmountPaid) lines.push('Never more than was paid, less earlier refunds.')
  if (rules.requiresOrderEmail) lines.push("Only for the order's own email address.")
  if (rules.selfServeLimitCents !== null) {
    lines.push(`Up to $${(rules.selfServeLimitCents / 100).toFixed(2)} per order without a person.`)
  }
  if (rules.noRefundDuringDispute) lines.push('None while a dispute is open.')
  return lines
}
