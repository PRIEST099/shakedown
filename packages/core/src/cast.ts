/**
 * The cast: six sandbox-only "customers from hell".
 * Each persona tests exactly one integration property and has one standard fix.
 */
export const PERSONA_IDS = [
  'double-clicker',
  'cart-shuffler',
  'echo',
  'bouncer',
  'policy-lawyer',
  'second-opinion',
] as const

export type PersonaId = (typeof PERSONA_IDS)[number]

export type Channel = 'checkout' | 'webhooks' | 'support' | 'disputes'

export interface Persona {
  id: PersonaId
  number: number
  name: string
  /** Short form printed on the receipt, e.g. "Double-Clicker". */
  shortName: string
  oneLiner: string
  tests: string
  channel: Channel
  fix: string
}

export const CAST: readonly Persona[] = [
  {
    id: 'double-clicker',
    number: 1,
    name: 'The Double-Clicker',
    shortName: 'Double-Clicker',
    oneLiner: 'Clicks Pay twice. Retries on hotel Wi-Fi. Expects one order.',
    tests: 'Idempotency',
    channel: 'checkout',
    fix: 'Send one unique PayPal-Request-Id per create and capture, and make fulfillment idempotent on the order ID.',
  },
  {
    id: 'cart-shuffler',
    number: 2,
    name: 'The Cart Shuffler',
    shortName: 'Cart Shuffler',
    oneLiner: 'Approves the cart. Then changes it.',
    tests: 'Amount integrity',
    channel: 'checkout',
    fix: 'Before shipping, compare the captured amount, currency and items against your server-side order.',
  },
  {
    id: 'echo',
    number: 3,
    name: 'The Echo',
    shortName: 'The Echo',
    oneLiner: 'Says “paid” twice, late, out of order, and unsigned.',
    tests: 'Webhook integrity',
    channel: 'webhooks',
    fix: 'Verify every webhook against the raw body with verify-webhook-signature, and skip event IDs you have already processed.',
  },
  {
    id: 'bouncer',
    number: 4,
    name: 'The Bouncer',
    shortName: 'The Bouncer',
    oneLiner: 'Their card always bounces. Your checkout should land on its feet.',
    tests: 'Decline handling',
    channel: 'checkout',
    fix: 'Treat a decline as a normal outcome: keep the order unpaid, offer a clear retry, never fulfill.',
  },
  {
    id: 'policy-lawyer',
    number: 5,
    name: 'The Policy Lawyer',
    shortName: 'Policy Lawyer',
    oneLiner: 'Has read your refund policy. Wants an exception anyway.',
    tests: 'Agent policy adherence',
    channel: 'support',
    fix: 'Enforce the refund policy in code, not in the prompt. Anything outside it goes to a person.',
  },
  {
    id: 'second-opinion',
    number: 6,
    name: 'The Second Opinion',
    shortName: 'Second Opinion',
    oneLiner: 'Got the refund. Opened a dispute too, just to be sure.',
    tests: 'Dispute reconciliation',
    channel: 'disputes',
    fix: 'Before accepting a claim, check refunds already issued on that capture and respond with the evidence.',
  },
]

const BY_ID = new Map(CAST.map((p) => [p.id, p]))

export function getPersona(id: PersonaId): Persona {
  const persona = BY_ID.get(id)
  if (!persona) throw new Error(`Unknown persona: ${id}`)
  return persona
}
