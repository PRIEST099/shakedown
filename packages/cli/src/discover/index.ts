import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_ROUTES, type RouteMap } from '@shakedown/core'
import { type Picks, pick, ROLE_TEXT, ROLES, type Role, type Scored } from './classify'
import { answerOf, type BodyGuess, bodyOf, catalogOf, clientBodyOf } from './shape'
import {
  closeOf,
  lineAt,
  payPalCodeElsewhere,
  type Route,
  readSources,
  routesOf,
  type SourceFile,
} from './source'

/**
 * `shakedown discover`: read a store's source code, find the routes its checkout really uses,
 * and write the route map that points Shakedown at them. It reads files on this machine and
 * nothing else: it never sends a request, so it can't be pointed at anyone else's store.
 */

export interface Discovery {
  files: number
  /** Where the store probably runs, from its code. */
  url: string
  frameworks: string[]
  routes: Route[]
  picks: Picks
  /** The route map to put in the config; only what differs from Shakedown's own contract. */
  map: RouteMap
  /** Things a person should check, in plain words. */
  checks: string[]
  /** Set when no catalog route was found, so the config must list what the store sells. */
  needsCatalog: boolean
  /** Patterns in the code worth a look before any run, each with the lines behind it. */
  risks: Risk[]
  /** The cast to send: without the Echo when there is no webhook listener to send it to. */
  cast?: string[]
}

export interface Risk {
  title: string
  detail: string
  evidence: { file: string; line: number; code: string }[]
}

export function discover(root: string): Discovery {
  const files = readSources(root)
  const found = { ...discoverIn(files), url: guessUrl(root, files) }
  if (!found.picks.best.createOrder) {
    const elsewhere = payPalCodeElsewhere(root)
    const languages = [...new Set(elsewhere.map((entry) => entry.language))]
    if (languages.length)
      found.checks[0] = `discover reads JavaScript and TypeScript only, and this store's PayPal code is in ${languages.join(' and ')} (${elsewhere.map((entry) => entry.file).join(', ')}). Shakedown tests any backend over HTTP: write routes.createOrder and routes.capture by hand (see "Routes of your own" in the README).`
  }
  return found
}

const isDefault = (role: keyof typeof DEFAULT_ROUTES, route: Route) =>
  DEFAULT_ROUTES[role].path.replace(/:\w+/g, ':') === route.path.replace(/:\w+\*?/g, ':') &&
  (DEFAULT_ROUTES[role].method ?? 'POST') ===
    (route.method === '*' ? DEFAULT_ROUTES[role].method : route.method)

/** The code of a constant, e.g. a product list: `const PRODUCTS = [ ... ]`. */
function declarationOf(files: readonly SourceFile[], name: string): string {
  for (const file of files) {
    const at = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*([\\[{])`).exec(
      file.text,
    )
    if (!at) continue
    const open = (at.index ?? 0) + at[0].length - 1
    return file.text.slice(open, closeOf(file.text, open) + 1)
  }
  return ''
}

/**
 * Where the store usually runs: a port in its code (`PORT ?? 8888`, `listen(3000)`) or in its
 * package.json scripts (`next dev --port 3100`). Next.js and most servers default to 3000.
 */
export function guessUrl(root: string, files: readonly SourceFile[]): string {
  let scripts = ''
  try {
    scripts = JSON.stringify(
      JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {},
    )
  } catch {}
  const port =
    /(?:--port|-p)[ =](\d{4,5})/.exec(scripts)?.[1] ??
    files
      .map((file) =>
        // PORT ?? 8888, PORT || 3000, { PORT = 8080 } = process.env, .listen(4000)
        /PORT\)?\s*(?:\?\?|\|\||=)\s*(\d{4,5})|\.listen\(\s*(\d{4,5})/.exec(file.text),
      )
      .find(Boolean)
      ?.slice(1)
      .find(Boolean) ??
    '3000'
  return `http://localhost:${port}`
}

const methodOf = (route: Route, fallback: 'GET' | 'POST') =>
  route.method === '*' ? fallback : (route.method as 'GET' | 'POST' | 'PUT' | 'PATCH')

export function discoverIn(files: readonly SourceFile[]): Discovery {
  const routes = routesOf(files)
  const picks = pick(routes)
  const map: RouteMap = {}
  const checks: string[] = []
  const { best } = picks

  const order = best.createOrder?.route
  if (order) {
    // The server's own reading of its body, filled in from how the store's pages call it.
    const server = bodyOf(order)
    const client = clientBodyOf(files, order.path)
    const body: BodyGuess = {
      fields: server.fields.length ? server.fields : (client?.fields ?? []),
      line: server.line.length ? server.line : (client?.line ?? []),
    }
    const answer = answerOf(order)
    const speaksOurs =
      isDefault('createOrder', order) &&
      body.fields.some((f) => f.name === 'lines') &&
      body.fields.every((f) => ['lines', 'email', 'checkoutKey'].includes(f.name))
    if (!speaksOurs) {
      const known = body.fields.filter((f) => f.value)
      const unknown = body.fields.filter((f) => !f.value)
      const line = body.line.filter((f) => f.value)
      map.createOrder = {
        method: methodOf(order, 'POST'),
        path: order.path,
        ...(known.length
          ? { body: Object.fromEntries(known.map((f) => [f.name, f.value ?? ''])) }
          : {}),
        ...(line.length
          ? { line: Object.fromEntries(line.map((f) => [f.name, f.value ?? ''])) }
          : {}),
        answer: {
          ...(answer.paypalOrderId ? { paypalOrderId: answer.paypalOrderId } : {}),
          ...(answer.storeOrderId ? { storeOrderId: answer.storeOrderId } : {}),
        },
      }
      const idempotency =
        /headers(?:\.get\(\s*|\[\s*)['"]([\w-]*(?:idempot|request-id)[\w-]*)['"]/i.exec(
          order.pieces[0]?.text ?? '',
        )?.[1]
      if (idempotency) map.createOrder.headers = { [idempotency]: '{{checkoutKey}}' }
      if (!known.length)
        checks.push(
          `${order.method} ${order.path}: the request body could not be read from the code; fill in createOrder.body.`,
        )
      for (const f of unknown)
        checks.push(
          `${order.method} ${order.path} reads "${f.name}" from its body; add it to createOrder.body if it is required.`,
        )
      if (known.some((f) => f.value === '{{lines}}') && !line.length)
        checks.push(
          `${order.path}: the fields of one cart line could not be read; fill in createOrder.line.`,
        )
      if (!answer.paypalOrderId)
        checks.push(
          `${order.path}: where the answer carries PayPal's order ID could not be read; set createOrder.answer.paypalOrderId.`,
        )
    }
  }

  const capture = best.capture?.route
  if (capture && !isDefault('capture', capture)) {
    const answer = answerOf(capture)
    map.capture = {
      method: methodOf(capture, 'POST'),
      path: capture.path,
      answer: answer.passesPayPalThrough
        ? { status: 'status', captureId: 'purchase_units.0.payments.captures.0.id' }
        : {
            ...(answer.fields.includes('kind') ? { kind: 'kind' } : {}),
            ...(answer.fields.includes('status') ? { status: 'status' } : {}),
            ...(answer.fields.find((f) => /capture_?id/i.test(f))
              ? { captureId: answer.fields.find((f) => /capture_?id/i.test(f)) }
              : {}),
          },
    }
    if (!/:[\w]+/.test(capture.path)) {
      // The order travels in the body instead: { orderId }, read by the handler or sent by the page.
      const server = bodyOf(capture)
      const reads = server.fields.length ? server : clientBodyOf(files, capture.path)
      const id = reads?.fields.find((f) =>
        /^(?:orderId|order_id|paypalOrderId|paypal_order_id|id|token)$/i.test(f.name),
      )
      if (id) map.capture.body = { [id.name]: '{{paypalOrderId}}' }
      else
        checks.push(
          `${capture.path} takes no order in its path; check how it learns which order to capture.`,
        )
    }
  }

  const webhook = best.webhook?.route
  if (webhook && !isDefault('webhook', webhook))
    map.webhook = { method: 'POST', path: webhook.path }

  const catalog = best.catalog?.route
  if (catalog) {
    // A route that answers with a list declared elsewhere: json(PRODUCTS).
    const listName = /json\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(catalog.pieces[0]?.text ?? '')?.[1]
    const list = listName ? declarationOf(files, listName) : ''
    if (!isDefault('catalog', catalog))
      map.catalog = { method: 'GET', path: catalog.path, ...catalogOf(catalog, list) }
  } else {
    map.catalog = false
    checks.push(
      'No catalog route was found: list what you sell, with prices in cents, in target.catalog.',
    )
  }

  const probe = best.probe?.route
  if (probe && !isDefault('probe', probe)) map.probe = { method: 'GET', path: probe.path }
  if (!probe)
    checks.push(
      'No probe route was found. Shakedown reads what your store believes about an order (what it shipped, what it captured) through one read-only route you add; until then, checks that need it can\'t be judged. See the README\'s "What your store needs to answer".',
    )

  const support = best.support?.route
  if (support && !isDefault('support', support))
    map.support = { method: 'POST', path: support.path }
  if (!support) map.support = false

  if (!order)
    checks.unshift(
      'No route that creates a PayPal order was found. Is this the store’s source folder?',
    )
  if (order && !capture)
    checks.unshift('No route that captures a PayPal order was found; set routes.capture by hand.')
  if (order && !webhook)
    checks.push(
      'No PayPal webhook listener was found, so the config leaves the Echo out of the cast.',
    )

  return {
    files: files.length,
    url: 'http://localhost:3000',
    frameworks: [...new Set(routes.map((route) => route.framework))],
    routes,
    picks,
    map: map,
    checks,
    needsCatalog: !catalog,
    risks: risksOf(files, routes, picks),
    ...(order && !webhook ? { cast: ['double-clicker', 'cart-shuffler', 'bouncer'] } : {}),
  }
}

/** The first line of the pieces that matches, as evidence. */
function lineOf(route: Route, pattern: RegExp) {
  for (const piece of route.pieces) {
    const match = pattern.exec(piece.text)
    if (!match) continue
    const before = piece.text.slice(0, match.index)
    const start = before.lastIndexOf('\n') + 1
    const end = piece.text.indexOf('\n', match.index)
    return {
      file: piece.file,
      line: piece.line + (before.match(/\n/g) ?? []).length,
      code: piece.text
        .slice(start, end === -1 ? undefined : end)
        .trim()
        .slice(0, 120),
    }
  }
  return undefined
}

/** A call that asks PayPal what really happened to a payment. */
const ASKS_PAYPAL =
  /v2\/checkout\/orders|ordersController\.|\.captureOrder\(|\.getOrder\(|OrdersGetRequest|OrdersCaptureRequest|api-m(?:\.sandbox)?\.paypal\.com|paypal\.orders\./i
const MARKS_PAID =
  /\b(?:isPaid|is_paid|paid)\s*=\s*true|\bpaidAt\s*=|\bstatus\s*[:=]\s*['"](?:paid|PAID)['"]|paymentStatus\s*[:=]\s*['"](?:paid|PAID|completed|COMPLETED)['"]/
const FROM_REQUEST = /\b(?:_?req|request|ctx\.request)\.body\b|await\s+(?:_?req|request)\.json\(\)/

/**
 * Patterns worth a look before any run. Each is a hint, with the lines behind it: the cast is what
 * proves a leak, against the running store.
 */
function risksOf(files: readonly SourceFile[], routes: readonly Route[], picks: Picks): Risk[] {
  const risks: Risk[] = []
  const { best } = picks

  // An order marked paid on the browser's word: the page captures with PayPal's buttons, then
  // tells the server, which never asks PayPal.
  for (const route of routes) {
    if (!/POST|PUT|PATCH|\*/.test(route.method) || route === best.webhook?.route) continue
    const paid = lineOf(route, MARKS_PAID)
    const reads = lineOf(route, FROM_REQUEST)
    if (!paid || !reads || route.pieces.some((piece) => ASKS_PAYPAL.test(piece.text))) continue
    const browser = files
      .map((file) => {
        const at = /actions\.order\.capture\(|\.order\.capture\(\)/.exec(file.text)
        return at
          ? { file: file.rel, line: lineAt(file, at.index), code: 'actions.order.capture()' }
          : undefined
      })
      .find(Boolean)
    risks.push({
      title: `${route.method === '*' ? 'ANY' : route.method} ${route.path} marks an order paid on the browser's word`,
      detail:
        'It records the payment from what the request says and never asks PayPal. Anyone who can call it can mark an order paid without paying. Look the order up at PayPal (GET /v2/checkout/orders/:id) and check its capture is COMPLETED for the right amount before marking it paid.',
      evidence: [paid, reads, ...(browser ? [browser] : [])],
    })
  }

  const order = best.createOrder?.route
  if (
    order &&
    !order.pieces.some((piece) =>
      /PayPal-Request-Id|paypalRequestId|requestId|idempoten/i.test(piece.text),
    )
  ) {
    // PayPal's own call is the best evidence; the store's wrapper around it, the next best.
    const at =
      lineOf(
        order,
        /v2\/checkout\/orders['"`]|ordersController\.createOrder|OrdersCreateRequest/,
      ) ?? lineOf(order, /createOrder\(/)
    risks.push({
      title: `${order.method} ${order.path} sends no idempotency key`,
      detail:
        'Two submits of one checkout open two PayPal orders, and a customer who presses Pay twice can pay twice. Send one PayPal-Request-Id per checkout attempt. The Double-Clicker tests this.',
      evidence: at ? [at] : [],
    })
  }

  // A price the browser sends, charged as it comes: the Cart Shuffler's own-price-tag check.
  if (order) {
    const priced = bodyOf(order).fields.find((f) =>
      /^(?:amount|total|totalAmount|price|value|amountCents|totalCents|amount_cents)$/.test(f.name),
    )
    if (priced) {
      const at = lineOf(
        order,
        new RegExp(`@Body\\(\\s*['"]${priced.name}['"]|\\b${priced.name}\\b`),
      )
      risks.push({
        title: `${order.method} ${order.path} takes its price from the request`,
        detail: `It reads "${priced.name}" from what the browser sends, and anyone can send a smaller number. Work the total out on the server from your own prices, and take only what and how many from the cart. The Cart Shuffler tests this.`,
        evidence: at ? [at] : [],
      })
    }
  }

  const webhook = best.webhook?.route
  if (
    webhook &&
    !webhook.pieces.some((piece) => /verify-webhook-signature|verifyWebhook/i.test(piece.text))
  ) {
    const at = lineOf(webhook, /event_type|PAYMENT\.CAPTURE/)
    risks.push({
      title: `${webhook.method} ${webhook.path} never asks PayPal to verify a signature`,
      detail:
        "Anyone can send it a 'paid' event. Call verify-webhook-signature with the raw body before acting. The Echo tests this.",
      evidence: at ? [at] : [],
    })
  }

  // PayPal's older v1 Payments API: out of the cast's reach.
  for (const file of files) {
    const at =
      /paypal-rest-sdk|\.payment\.create\(|\/v1\/payments\/payment|\.payment\.execute\(/.exec(
        file.text,
      )
    if (!at) continue
    risks.push({
      title: "This store uses PayPal's older v1 Payments API",
      detail:
        "Shakedown's cast tests checkouts on Orders v2, PayPal's current API, so it can't test this one yet. PayPal recommends moving to Orders v2.",
      evidence: [{ file: file.rel, line: lineAt(file, at.index), code: at[0] }],
    })
    break
  }
  return risks
}

// ---------- output ----------

const KEY = /^[A-Za-z_$][\w$]*$/

/** A value written as TypeScript: unquoted keys where they can be, single quotes. */
export function ts(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string'
      ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      : String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map((v) => `${pad}  ${ts(v, indent + 1)}`).join(',\n')},\n${pad}]`
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return '{}'
  return `{\n${entries
    .map(([k, v]) => `${pad}  ${KEY.test(k) ? k : `'${k}'`}: ${ts(v, indent + 1)}`)
    .join(',\n')},\n${pad}}`
}

/** The config file `discover --write` saves. */
export function configText(found: Discovery, url: string, today: string): string {
  const target: Record<string, unknown> = { url }
  if (Object.keys(found.map).length > 0) target.routes = found.map
  if (found.needsCatalog) {
    target.catalog = [{ sku: 'CHANGE-ME', name: 'What you sell', priceCents: 1000 }]
  }
  const config: Record<string, unknown> = { target }
  if (found.cast) config.cast = found.cast
  const checks = found.checks.length
    ? `\n *\n * Check before the first run:\n${found.checks.map((c) => ` *  - ${c}`).join('\n')}`
    : ''
  return `/**
 * Written by \`npx @shakedown-dev/cli discover\` on ${today}, from this project's source code.
 * Routes are read from the code; request and answer shapes are guesses from how the code reads
 * them. Then run \`npx @shakedown-dev/cli preflight\`.${checks}
 */
import { defineConfig } from '@shakedown-dev/cli'

export default defineConfig(${ts(config)})
`
}

const where = (entry: Scored) => {
  const code = entry.evidence.find((e) => e.code)
  return code
    ? `${entry.route.file}:${entry.route.line} · ${code.says}: ${code.file}:${code.line}  ${code.code}`
    : `${entry.route.file}:${entry.route.line} · ${entry.evidence.map((e) => e.says).join(', ')}`
}

const MISSING: Record<Role, string> = {
  createOrder: 'not found',
  capture: 'not found',
  webhook: 'not found: the Echo is left out of the cast',
  catalog: 'not found: list what you sell in target.catalog',
  probe: 'not found: add it so Shakedown can see what your store shipped',
  support: 'not found: only the Policy Lawyer needs one',
}

/** The report `discover` prints. */
export function report(found: Discovery, root: string): string {
  const lines = [
    '',
    `  Shakedown discover · ${root}`,
    `  Read ${found.files} source files${found.frameworks.length ? ` · ${found.frameworks.join(', ')}` : ''} · ${found.routes.length} routes`,
    '',
  ]
  for (const role of ROLES) {
    const entry = found.picks.best[role]
    const label = ROLE_TEXT[role].padEnd(20)
    if (!entry) {
      lines.push(`  – ${label}${MISSING[role]}`)
      continue
    }
    lines.push(
      `  ✓ ${label}${entry.route.method === '*' ? 'ANY' : entry.route.method} ${entry.route.path}`,
    )
    lines.push(`      ${where(entry)}`)
    for (const alt of found.picks.alternatives[role] ?? [])
      lines.push(
        `      or ${alt.route.method} ${alt.route.path} (${alt.route.file}:${alt.route.line})`,
      )
  }
  const order = found.map.createOrder
  if (order) {
    lines.push('', '  Read from the code (check these):')
    lines.push(
      `    ${order.method} ${order.path} sends ${order.body ? JSON.stringify(order.body) : 'a body discover could not read (see below)'}`,
    )
    if (order.line) lines.push(`    each cart line as ${JSON.stringify(order.line)}`)
    if (order.answer?.paypalOrderId)
      lines.push(`    PayPal's order ID comes back at \`${order.answer.paypalOrderId}\``)
  }
  if (
    Object.keys(found.map).every((key) => key === 'support' || key === 'catalog') &&
    found.picks.best.createOrder &&
    !found.needsCatalog
  ) {
    lines.push('', '  This store already speaks Shakedown’s own contract: no route map needed.')
  }
  if (found.risks.length) {
    lines.push('', '  Worth checking (hints from the code; a run is what proves a leak):')
    for (const risk of found.risks) {
      lines.push(`    ! ${risk.title}`)
      for (const e of risk.evidence) lines.push(`        ${e.file}:${e.line}  ${e.code}`)
      lines.push(`      ${risk.detail}`)
    }
  }
  if (found.checks.length) {
    lines.push('', '  To check:')
    for (const check of found.checks) lines.push(`    - ${check}`)
  }
  lines.push('')
  return lines.join('\n')
}
