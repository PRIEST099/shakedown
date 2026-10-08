import type { Piece, Route } from './source'

/**
 * Which route does what. Each role has signals: the PayPal API calls and event names that only
 * a route doing that job would touch, and hints in its method and path. A route's score for a
 * role is the sum of the signals found in its own code and in what it calls, each counted once.
 * The best route per role wins when it scores high enough; the rest are listed as alternatives.
 */

export type Role = 'createOrder' | 'capture' | 'webhook' | 'catalog' | 'probe' | 'support'

export const ROLE_TEXT: Record<Role, string> = {
  createOrder: 'Open a checkout',
  capture: 'Capture a payment',
  webhook: 'Webhook listener',
  catalog: 'Catalog',
  probe: 'Probe (Shakedown’s)',
  support: 'Support assistant',
}

interface Signal {
  role: Role
  weight: number
  /** What it means, for the report. */
  says: string
  /** Matched against the code. */
  code?: RegExp
  /** Matched against the route's own path. */
  path?: RegExp
  method?: RegExp
}

const SIGNALS: Signal[] = [
  // Opening a PayPal order.
  {
    role: 'createOrder',
    weight: 4,
    says: 'creates a PayPal order',
    code: /v2\/checkout\/orders['"`]|OrdersCreateRequest|ordersController\.createOrder|orders\.create\(|\.createOrder\(/,
  },
  {
    role: 'createOrder',
    weight: 2,
    says: 'sets the order intent',
    code: /intent['"]?\s*:\s*['"]CAPTURE|purchase_units/,
  },
  { role: 'createOrder', weight: 1, says: 'POST', method: /POST|\*/ },
  { role: 'createOrder', weight: 1, says: 'an order route', path: /order|checkout|payment|pay\b/i },
  { role: 'createOrder', weight: -5, says: 'captures instead', path: /capture|webhook|refund/i },
  // Capturing it.
  {
    role: 'capture',
    weight: 4,
    says: 'captures a PayPal order',
    code: /\/capture['"`]|OrdersCaptureRequest|ordersController\.captureOrder|orders\.capture\(|\.captureOrder\(|captureOrder\(/,
  },
  {
    role: 'capture',
    weight: 4,
    says: "captures with the order's own intent",
    code: /\/\$\{\s*intent\s*\}|['"`]\/['"`]\s*\+\s*[\w.]*intent\.toLowerCase\(\)/,
  },
  { role: 'capture', weight: 3, says: 'a capture route', path: /capture/i },
  {
    role: 'capture',
    weight: 1,
    says: 'where the buyer lands after paying',
    path: /execute|complete|approve|success|return|confirm|finali[sz]e/i,
  },
  { role: 'capture', weight: 1, says: 'takes the order in its path', path: /:[\w*]+/ },
  { role: 'capture', weight: -5, says: 'a webhook or refund route', path: /webhook|refund/i },
  // Hearing from PayPal.
  {
    role: 'webhook',
    weight: 4,
    says: 'handles PayPal webhooks',
    code: /verify-webhook-signature|verifyWebhook|paypal-transmission-sig|transmission[-_]?(?:sig|id|headers)|transmissionHeaders/i,
  },
  {
    role: 'webhook',
    weight: 3,
    says: 'reads PayPal event types',
    code: /PAYMENT\.CAPTURE\.(?:COMPLETED|DENIED|DECLINED|REFUNDED|PENDING)|CHECKOUT\.ORDER\.(?:APPROVED|COMPLETED)|event_type/,
  },
  { role: 'webhook', weight: 2, says: 'a webhook route', path: /webhook|ipn|notif|hook/i },
  {
    role: 'webhook',
    weight: 3,
    says: 'a PayPal webhook route',
    path: /webhooks?\/paypal|paypal[-_/]?webhooks?/i,
  },
  { role: 'webhook', weight: -3, says: 'not POST', method: /GET/ },
  // What the store sells.
  {
    role: 'catalog',
    weight: 3,
    says: 'a product list route',
    path: /catalog|products?(?:\/?$)|items(?:\/?$)|inventory/i,
  },
  { role: 'catalog', weight: 1, says: 'GET', method: /GET|\*/ },
  { role: 'catalog', weight: 1, says: 'has prices', code: /price/i },
  { role: 'catalog', weight: -4, says: 'takes a parameter', path: /:[\w*]+/ },
  { role: 'catalog', weight: -4, says: 'not GET', method: /POST|PUT|PATCH|DELETE/ },
  // Shakedown's own probe route.
  {
    role: 'probe',
    weight: 5,
    says: 'checks the Shakedown probe header',
    code: /x-shakedown-probe|SHAKEDOWN_PROBE_SECRET/i,
  },
  { role: 'probe', weight: 2, says: 'a probe route', path: /probe|shakedown/i },
  { role: 'probe', weight: -4, says: 'not GET', method: /POST|PUT|PATCH|DELETE/ },
  // A support assistant.
  { role: 'support', weight: 4, says: 'a chat route', path: /chat|assistant/i },
  { role: 'support', weight: 2, says: 'a support route', path: /support|help/i },
  {
    role: 'support',
    weight: 1,
    says: 'reads a conversation',
    code: /\bmessages\b|role\s*:\s*['"](?:user|assistant)['"]/,
  },
  {
    role: 'support',
    weight: 2,
    says: 'calls a language model',
    code: /@anthropic-ai\/sdk|messages\.create\(|openai|chat\.completions|generateText\(|streamText\(/i,
  },
  { role: 'support', weight: -4, says: 'not POST', method: /GET/ },
]

export interface Evidence {
  says: string
  file: string
  line: number
  /** The line of code that matched, trimmed. */
  code?: string
}

export interface Scored {
  route: Route
  role: Role
  score: number
  evidence: Evidence[]
}

/** Where in a set of pieces a pattern first matches: file, line and the line's code. */
function locate(pieces: readonly Piece[], pattern: RegExp) {
  for (const piece of pieces) {
    const match = pattern.exec(piece.text)
    if (!match) continue
    const before = piece.text.slice(0, match.index)
    const offset = (before.match(/\n/g) ?? []).length
    const lineStart = before.lastIndexOf('\n') + 1
    const lineEnd = piece.text.indexOf('\n', match.index)
    return {
      file: piece.file,
      line: piece.line + offset,
      code: piece.text
        .slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
        .trim()
        .slice(0, 120),
    }
  }
  return undefined
}

/** Roles whose code signals only count where the code has to do with PayPal. */
const PAYPAL_ROLES = new Set<Role>(['createOrder', 'capture', 'webhook'])

/**
 * `payPalFiles`: the files that mention PayPal. A store's own `ordersController.createOrder`, or a
 * webhook from another payment provider, only counts when its code has to do with PayPal.
 */
export function score(route: Route, role: Role, payPalFiles?: ReadonlySet<string>): Scored {
  let total = 0
  const evidence: Evidence[] = []
  const aboutPayPal = !payPalFiles || route.pieces.some((piece) => payPalFiles.has(piece.file))
  for (const signal of SIGNALS) {
    if (signal.role !== role) continue
    if (signal.code && PAYPAL_ROLES.has(role) && !aboutPayPal) continue
    if (signal.method && !signal.method.test(route.method)) continue
    if (signal.path && !signal.path.test(route.path)) continue
    if (signal.code) {
      const at = locate(route.pieces, signal.code)
      if (!at) continue
      evidence.push({ says: signal.says, ...at })
    } else if (signal.weight > 0) {
      evidence.push({ says: signal.says, file: route.file, line: route.line })
    }
    total += signal.weight
  }
  return { route, role, score: total, evidence }
}

/** The score a route needs before it is named for a role. */
const ENOUGH: Record<Role, number> = {
  createOrder: 5,
  capture: 5,
  webhook: 5,
  catalog: 4,
  probe: 5,
  support: 4,
}

export interface Picks {
  best: Partial<Record<Role, Scored>>
  /** Other routes that also scored for a role, best first. */
  alternatives: Partial<Record<Role, Scored[]>>
}

export const ROLES: readonly Role[] = [
  'createOrder',
  'capture',
  'webhook',
  'catalog',
  'probe',
  'support',
]

/** The best route for each role, each route used for one role at most. */
export function pick(routes: readonly Route[], payPalFiles?: ReadonlySet<string>): Picks {
  const all = ROLES.flatMap((role) => routes.map((route) => score(route, role, payPalFiles)))
    .filter((entry) => entry.score >= ENOUGH[entry.role])
    // Best score first; on a tie, the shorter path: the resource, not a route beneath it.
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.route.path.split('/').length - b.route.path.split('/').length ||
        a.route.path.length - b.route.path.length,
    )
  const best: Partial<Record<Role, Scored>> = {}
  const used = new Set<Route>()
  for (const entry of all) {
    if (best[entry.role] || used.has(entry.route)) continue
    best[entry.role] = entry
    used.add(entry.route)
  }
  const alternatives: Partial<Record<Role, Scored[]>> = {}
  for (const role of ROLES) {
    const others = all.filter((entry) => entry.role === role && entry !== best[role])
    if (others.length) alternatives[role] = others.slice(0, 3)
  }
  return { best, alternatives }
}
