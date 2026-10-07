import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Reading a project's source, for `discover`: the files, the routes each web framework declares,
 * every function a handler might call, and the code of a handler together with what it calls.
 * Plain text and regular expressions, with a small scanner for matching brackets: no build, no
 * dependencies, nothing run. Only the operator's own files are read, on their own machine.
 */

export interface SourceFile {
  /** Relative to the project root, with forward slashes. */
  rel: string
  text: string
  /** Where each line starts, for turning an offset into a line number. */
  starts: number[]
}

/** A piece of code, with where it came from. */
export interface Piece {
  file: string
  line: number
  text: string
}

export interface Route {
  method: string
  /** The path, with `:params`. */
  path: string
  file: string
  line: number
  framework: string
  /** The handler's own code, then the code of what it calls (two levels deep). */
  pieces: Piece[]
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  '.turbo',
  '.vercel',
  '.shakedown',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  '.data',
])
const SOURCE = /\.(?:[cm]?[jt]sx?)$/
const TEST = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$)|(?:^|\/)(?:__tests__|e2e|tests?)\//
const MAX_FILES = 6000
const MAX_BYTES = 400_000

/** Every source file under the root, skipping dependencies, build output and tests. */
export function readSources(root: string): SourceFile[] {
  const files: SourceFile[] = []
  const walk = (dir: string) => {
    if (files.length >= MAX_FILES) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries.sort()) {
      const full = path.join(dir, name)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith('.')) walk(full)
        continue
      }
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (!SOURCE.test(name) || TEST.test(rel) || name.endsWith('.d.ts')) continue
      if (stat.size > MAX_BYTES) continue
      files.push(sourceOf(rel, readFileSync(full, 'utf8')))
      if (files.length >= MAX_FILES) return
    }
  }
  walk(root)
  return files
}

export function sourceOf(rel: string, text: string): SourceFile {
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1)
  return { rel, text, starts }
}

/** The 1-based line of an offset. */
export function lineAt(file: SourceFile, offset: number): number {
  let lo = 0
  let hi = file.starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((file.starts[mid] ?? 0) <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/**
 * Where the bracket opened at `open` closes, skipping strings, template literals and comments.
 * The end of the text when it never does.
 */
export function closeOf(text: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' }
  const stack: string[] = []
  for (let i = open; i < text.length; i += 1) {
    const c = text[i] ?? ''
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
      continue
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1
      continue
    }
    if (pairs[c]) stack.push(pairs[c] ?? '')
    else if (c === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) return i
    }
  }
  return text.length - 1
}

// ---------- functions a handler might call ----------

export interface Definition {
  name: string
  file: string
  line: number
  text: string
}

const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'constructor',
  'super',
  'import',
  'require',
  'typeof',
  'await',
  'new',
])

/** A function's code, from where its name appears to the end of its body. */
function bodyFrom(file: SourceFile, start: number, from: number): string {
  // Past the parameters, to the body: a block, or for an arrow, its expression.
  const params = file.text.indexOf('(', from)
  if (params === -1) return ''
  const afterParams = closeOf(file.text, params) + 1
  const rest = file.text.slice(afterParams, afterParams + 400)
  const brace = rest.search(/\{/)
  const arrow = rest.search(/=>/)
  if (arrow !== -1 && (brace === -1 || arrow < brace)) {
    const bodyAt = afterParams + arrow + 2
    const first = file.text.slice(bodyAt).search(/\S/)
    const at = bodyAt + Math.max(0, first)
    if (file.text[at] === '{' || file.text[at] === '(') {
      return file.text.slice(start, closeOf(file.text, at) + 1)
    }
    const end = file.text.indexOf('\n', at)
    return file.text.slice(start, end === -1 ? undefined : end)
  }
  if (brace === -1) return ''
  return file.text.slice(start, closeOf(file.text, afterParams + brace) + 1)
}

/** Every named function, arrow function and method in the project. */
export function definitionsOf(files: readonly SourceFile[]): Map<string, Definition[]> {
  const out = new Map<string, Definition[]>()
  const add = (file: SourceFile, name: string, start: number, nameAt: number) => {
    if (KEYWORDS.has(name)) return
    const text = bodyFrom(file, start, nameAt)
    if (!text) return
    const list = out.get(name) ?? []
    list.push({ name, file: file.rel, line: lineAt(file, start), text: text.slice(0, 20_000) })
    out.set(name, list)
  }
  const patterns = [
    /(?:^|[^\w$.])(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\(/g,
    /(?:^|[^\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:function\b[^(]*)?(?:<[^>()]*>)?\s*\(/g,
    /^[ \t]*(?:(?:public|private|protected|static|async|override)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\([^)]*\)\s*(?::\s*[^{=;\n]+)?\{/gm,
  ]
  for (const file of files) {
    for (const pattern of patterns) {
      for (const match of file.text.matchAll(pattern)) {
        const name = match[1] ?? ''
        const start = (match.index ?? 0) + match[0].indexOf(name)
        add(file, name, start, start + name.length)
      }
    }
  }
  return out
}

/** The names a piece of code calls, or hands on as a handler. */
function calledIn(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(/(?:^|[^\w$])([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\(/g)) {
    names.add(match[1] ?? '')
  }
  return [...names].filter((name) => name && !KEYWORDS.has(name))
}

const GENERIC = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'json',
  'then',
  'catch',
  'map',
  'filter',
  'push',
  'find',
  'reduce',
  'slice',
  'join',
  'split',
  'toString',
  'String',
  'Number',
  'Boolean',
  'parse',
  'stringify',
  'fetch',
  'handler',
])

/**
 * A handler's code and the code of what it calls, two levels deep. A name defined in many places
 * (a `POST` in every route file) is followed only where it is defined in the same file.
 */
export function withCallees(
  own: Piece,
  definitions: Map<string, Definition[]>,
  extra: string[] = [],
): Piece[] {
  const pieces: Piece[] = [own]
  const seen = new Set<string>([`${own.file}:${own.line}`])
  let frontier: Piece[] = [own]
  let budget = 160_000
  for (let depth = 0; depth < 2 && frontier.length > 0; depth += 1) {
    const next: Piece[] = []
    for (const piece of frontier) {
      const names = [...calledIn(piece.text), ...(depth === 0 ? extra : [])]
      for (const name of names) {
        if (GENERIC.has(name)) continue
        const all = definitions.get(name) ?? []
        const local = all.filter((def) => def.file === piece.file)
        const chosen = local.length > 0 ? local : all.length <= 3 ? all : []
        for (const def of chosen) {
          const key = `${def.file}:${def.line}`
          if (seen.has(key) || budget <= 0) continue
          seen.add(key)
          budget -= def.text.length
          const callee = { file: def.file, line: def.line, text: def.text }
          pieces.push(callee)
          next.push(callee)
        }
      }
    }
    frontier = next
  }
  return pieces
}

// ---------- routes, by framework ----------

const segment = (part: string) =>
  part.replace(/^\[\[?\.\.\.([^\]]+)\]\]?$/, ':$1*').replace(/^\[([^\]]+)\]$/, ':$1')

const joinPath = (parts: string[]) =>
  `/${parts
    .filter((part) => part && !/^\(.*\)$/.test(part) && !part.startsWith('@'))
    .map(segment)
    .join('/')}`.replace(/\/+$/, '') || '/'

const METHOD_EXPORT =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g

/** The exported handlers of a file-based route (Next.js app router, SvelteKit). */
function exportedHandlers(
  file: SourceFile,
  framework: string,
  routePath: string,
): (Omit<Route, 'pieces'> & { own: Piece })[] {
  const out: (Omit<Route, 'pieces'> & { own: Piece })[] = []
  for (const match of file.text.matchAll(METHOD_EXPORT)) {
    const method = match[1] ?? match[2] ?? 'GET'
    const start = match.index ?? 0
    const text = bodyFrom(file, start, start + match[0].length - method.length) || file.text
    const line = lineAt(file, start)
    out.push({
      method,
      path: routePath,
      file: file.rel,
      line,
      framework,
      own: { file: file.rel, line, text },
    })
  }
  return out
}

const CLIENTS =
  /^(?:axios|http|https|fetch|client|request|got|superagent|ky|agent|api|\$fetch|ofetch)$/

/** Routes declared in code, Express style: `app.post('/api/orders', ...)`, with any mount prefix. */
function declaredRoutes(files: readonly SourceFile[]) {
  const out: (Omit<Route, 'pieces'> & { own: Piece; extra: string[] })[] = []
  // Routers mounted under a prefix: app.use('/api', ordersRouter), with where they came from.
  const mounts = new Map<string, string>()
  for (const file of files) {
    for (const match of file.text.matchAll(
      /\.use\(\s*(['"`])(\/[^'"`]*)\1\s*,\s*([A-Za-z_$][\w$]*)/g,
    )) {
      const prefix = match[2] ?? ''
      const name = match[3] ?? ''
      const imported = new RegExp(
        `(?:import\\s+${name}\\s+from|import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from|${name}\\s*=\\s*require\\()\\s*\\(?\\s*['"\`]([^'"\`]+)`,
      ).exec(file.text)?.[1]
      if (imported?.startsWith('.')) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file.rel), imported))
        mounts.set(target.replace(/\.[cm]?[jt]sx?$/, ''), prefix.replace(/\/$/, ''))
      }
    }
  }
  for (const file of files) {
    const prefix =
      mounts.get(file.rel.replace(/\.[cm]?[jt]sx?$/, '')) ??
      mounts.get(file.rel.replace(/\/index\.[cm]?[jt]sx?$/, '')) ??
      ''
    for (const match of file.text.matchAll(
      /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all)\(\s*(['"`])(\/[^'"`]*)\3/g,
    )) {
      const receiver = match[1] ?? ''
      if (CLIENTS.test(receiver)) continue
      const start = match.index ?? 0
      const open = file.text.indexOf('(', start)
      const text = file.text.slice(start, closeOf(file.text, open) + 1)
      // Handlers passed by name: router.post('/orders', auth, createOrder)
      const args = text.slice(text.indexOf(match[4] ?? '') + (match[4]?.length ?? 0) + 1)
      const extra = [...args.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*(?=[,)])/g)].map((m) => m[1] ?? '')
      const line = lineAt(file, start)
      out.push({
        method: (match[2] ?? 'get').toUpperCase().replace('ALL', '*'),
        path: `${receiver === 'app' ? '' : prefix}${match[4] ?? ''}` || '/',
        file: file.rel,
        line,
        framework: 'Express-style router',
        own: { file: file.rel, line, text },
        extra,
      })
    }
  }
  return out
}

/** Every route the project declares, in any framework this knows, with the code behind it. */
export function routesOf(files: readonly SourceFile[]): Route[] {
  const definitions = definitionsOf(files)
  const found: (Omit<Route, 'pieces'> & { own: Piece; extra?: string[] })[] = []
  for (const file of files) {
    const next = /(?:^|\/)app\/(.*?)\/?route\.[cm]?[jt]sx?$/.exec(file.rel)
    if (next && !file.rel.includes('/pages/')) {
      found.push(
        ...exportedHandlers(file, 'Next.js app router', joinPath((next[1] ?? '').split('/'))),
      )
      continue
    }
    const pages = /(?:^|\/)pages\/api\/(.*)\.[cm]?[jt]sx?$/.exec(file.rel)
    if (pages) {
      const parts = (pages[1] ?? '').split('/')
      if (parts.at(-1) === 'index') parts.pop()
      const methods = [
        ...new Set(
          [
            ...file.text.matchAll(
              /method\s*(?:===?|!==?)\s*['"](GET|POST|PUT|PATCH|DELETE)['"]|case\s+['"](GET|POST|PUT|PATCH|DELETE)['"]/g,
            ),
          ].map((m) => m[1] ?? m[2] ?? ''),
        ),
      ]
      for (const method of methods.length ? methods : ['*']) {
        found.push({
          method,
          path: joinPath(['api', ...parts]),
          file: file.rel,
          line: 1,
          framework: 'Next.js pages router',
          own: { file: file.rel, line: 1, text: file.text },
        })
      }
      continue
    }
    const svelte = /(?:^|\/)src\/routes\/(.*?)\/?\+server\.[jt]s$/.exec(file.rel)
    if (svelte) {
      found.push(...exportedHandlers(file, 'SvelteKit', joinPath((svelte[1] ?? '').split('/'))))
      continue
    }
    const nitro =
      /(?:^|\/)server\/(api|routes)\/(.*?)(?:\.(get|post|put|patch|delete))?\.[jt]s$/.exec(file.rel)
    if (nitro) {
      const parts = (nitro[2] ?? '').split('/')
      if (parts.at(-1) === 'index') parts.pop()
      found.push({
        method: (nitro[3] ?? '*').toUpperCase(),
        path: joinPath([...(nitro[1] === 'api' ? ['api'] : []), ...parts]),
        file: file.rel,
        line: 1,
        framework: 'Nuxt server route',
        own: { file: file.rel, line: 1, text: file.text },
      })
    }
  }
  found.push(...declaredRoutes(files))
  return found.map(({ own, extra, ...route }) => ({
    ...route,
    pieces: withCallees(own, definitions, extra),
  }))
}
