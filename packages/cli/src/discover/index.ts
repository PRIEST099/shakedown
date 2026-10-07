import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_ROUTES, type RouteMap } from '@shakedown/core'
import { type Picks, pick, ROLE_TEXT, ROLES, type Role, type Scored } from './classify'
import { answerOf, bodyOf, catalogOf } from './shape'
import { closeOf, type Route, readSources, routesOf, type SourceFile } from './source'

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
}

export function discover(root: string): Discovery {
  const files = readSources(root)
  return { ...discoverIn(files), url: guessUrl(root, files) }
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
      .map((file) => /PORT\)?\s*(?:\?\?|\|\|)\s*(\d{4,5})|\.listen\(\s*(\d{4,5})/.exec(file.text))
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
    const body = bodyOf(order)
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
    if (!/:[\w]+/.test(capture.path))
      checks.push(
        `${capture.path} takes no order in its path; check how it learns which order to capture.`,
      )
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
    checks.push('No PayPal webhook listener was found; the Echo will be sent to the default path.')

  return {
    files: files.length,
    url: 'http://localhost:3000',
    frameworks: [...new Set(routes.map((route) => route.framework))],
    routes,
    picks,
    map: map,
    checks,
    needsCatalog: !catalog,
  }
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
  const checks = found.checks.length
    ? `\n *\n * Check before the first run:\n${found.checks.map((c) => ` *  - ${c}`).join('\n')}`
    : ''
  return `/**
 * Written by \`npx @shakedown-dev/cli discover\` on ${today}, from this project's source code.
 * Routes are read from the code; request and answer shapes are guesses from how the code reads
 * them. Then run \`npx @shakedown-dev/cli preflight\`.${checks}
 */
import { defineConfig } from '@shakedown-dev/cli'

export default defineConfig(${ts({ target })})
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
  webhook: 'not found: the Echo is sent to the default path',
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
      `    ${order.method} ${order.path} sends ${order.body ? JSON.stringify(order.body) : 'Shakedown’s own body'}`,
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
  if (found.checks.length) {
    lines.push('', '  To check:')
    for (const check of found.checks) lines.push(`    - ${check}`)
  }
  lines.push('')
  return lines.join('\n')
}
