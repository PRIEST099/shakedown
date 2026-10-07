import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { loadEnv } from '@shakedown/core'
import { printReceipt, shouldAnimate } from '@shakedown/reporters'
import pkg from '../package.json' with { type: 'json' }
import { commentCommand } from './comment'
import { ConfigError, loadConfig } from './config'
import type { RouteMap } from './define'
import { discoverCommand } from './discover/command'
import { EXIT } from './exit-codes'
import { combine, preflight, preflightTarget } from './preflight'
import { reportCommand } from './report'
import { runCommand } from './run'

const VERSION = pkg.version

const HELP = `shakedown ${VERSION}: customers from hell for your PayPal sandbox checkout

Usage:
  npx @shakedown-dev/cli run [options]        Send the customers in and grade what PayPal saw
  npx @shakedown-dev/cli report [options]     Open the last report, or print it in another format
  npx @shakedown-dev/cli preflight [options]  Check your setup, your store and the sandbox lock
  npx @shakedown-dev/cli discover [folder]    Find your checkout's routes in your source code
  npx @shakedown-dev/cli comment              In GitHub Actions: post the scoreboard on the PR

Run options:
  --target <url>        Your store (or set target.url in shakedown.config.ts)
  --cast <names>        Comma list: double-clicker, cart-shuffler, echo, bouncer, policy-lawyer
  --seed <n>            The same seed replays the same customers and amounts
  --budget <usd>        Claude spend this run may add (default 0: replayed answers only)
  --explain             Explain each leak in plain words with Claude (uses the budget)
  --switches <seal>     Demo stores only: leaky or sealed
  --strict              Exit 2 when anything was inconclusive or skipped
  --ci                  No animation; never opens anything
  --out <dir>           Where reports go (default .shakedown)

Common options:
  --config <file>       Default: the first shakedown.config.{ts,mts,js,mjs,json,yaml,yml} here
  --env-file <file>     Default: .env.local, if it exists
  --format <name>       report only: html, terminal, markdown, junit or json
  --write               discover only: save the route map as shakedown.config.ts

Exit codes: 0 pass · 1 leaks · 2 inconclusive (strict) · 3 safety lock · 4 config · 5 preflight
Sandbox only. Your credentials never leave this machine.`

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      'env-file': { type: 'string' },
      config: { type: 'string' },
      target: { type: 'string' },
      cast: { type: 'string' },
      seed: { type: 'string' },
      budget: { type: 'string' },
      explain: { type: 'boolean' },
      switches: { type: 'string' },
      strict: { type: 'boolean' },
      ci: { type: 'boolean' },
      out: { type: 'string' },
      format: { type: 'string' },
      write: { type: 'boolean' },
    },
  })
}

async function main(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${HELP}`)
    return EXIT.config
  }
  const { values: flags, positionals } = parsed
  if (flags.version) {
    console.log(VERSION)
    return EXIT.pass
  }
  const [command] = positionals
  if (flags.help || !command) {
    console.log(HELP)
    return EXIT.pass
  }

  const envFile = resolve(flags['env-file'] ?? '.env.local')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  else if (flags['env-file']) {
    console.error(`No env file at ${envFile}.`)
    return EXIT.config
  }
  const log = (line: string) => console.error(line)
  const animate = shouldAnimate({ ci: flags.ci })
  const print = (text: string) => printReceipt(text, { animate })

  if (command === 'run') {
    const controller = new AbortController()
    process.once('SIGINT', () => {
      log('\n  Stopping after the current step…')
      controller.abort()
    })
    const code = await runCommand(flags, {
      cwd: process.cwd(),
      env: process.env,
      version: VERSION,
      print,
      log,
      signal: controller.signal,
    })
    return controller.signal.aborted ? 130 : code
  }

  if (command === 'report') return reportCommand(flags, { cwd: process.cwd(), print, log })

  if (command === 'comment')
    return commentCommand(flags, { cwd: process.cwd(), env: process.env, log })

  if (command === 'discover') return discoverCommand(positionals[1] ?? '.', flags)

  if (command === 'preflight') {
    const result = await runPreflight(flags)
    for (const check of result.checks) {
      console.log(
        `${check.warn ? '!' : check.ok ? '✓' : '✗'} ${check.label.padEnd(22)} ${check.detail}`,
      )
    }
    console.log(
      result.exitCode === EXIT.pass
        ? '\nReady for the sandbox.'
        : '\nNot ready yet. Fix the ✗ lines above.',
    )
    return result.exitCode
  }

  console.error(`Unknown command: ${command}\n\n${HELP}`)
  return EXIT.config
}

async function runPreflight(flags: { config?: string; target?: string }) {
  const base = preflight(process.env)
  let url = flags.target
  let allowHosts: string[] | undefined
  let routes: RouteMap | undefined
  let catalog: unknown[] | undefined
  try {
    const loaded = await loadConfig({ cwd: process.cwd(), file: flags.config })
    url ??= loaded?.config.target.url
    allowHosts = loaded?.config.target.allowHosts
    routes = loaded?.config.target.routes
    catalog = loaded?.config.target.catalog
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    return combine(base, {
      exitCode: EXIT.config,
      checks: [{ label: 'Config', ok: false, detail: error.message }],
    })
  }
  if (!url) {
    return combine(base, {
      exitCode: EXIT.pass,
      checks: [
        { label: 'Target', ok: true, detail: 'none configured yet (pass --target to check one)' },
      ],
    })
  }
  let env: ReturnType<typeof loadEnv> | undefined
  try {
    env = loadEnv(process.env)
  } catch {
    return base
  }
  return combine(
    base,
    await preflightTarget({
      url,
      allowHosts,
      probeSecret: env.SHAKEDOWN_PROBE_SECRET,
      verificationToken: env.SHAKEDOWN_VERIFICATION_TOKEN,
      routes,
      catalog,
    }),
  )
}

process.exitCode = await main(process.argv.slice(2))
