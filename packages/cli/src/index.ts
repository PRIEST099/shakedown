import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { EXIT } from './exit-codes'
import { preflight } from './preflight'

const VERSION = '0.0.0'

const HELP = `shakedown ${VERSION}: customers from hell for your PayPal sandbox checkout

Usage:
  shakedown preflight [--env-file <path>]   Check your setup and the sandbox lock
  shakedown --version
  shakedown --help

Sandbox only. Your credentials never leave this machine.`

function main(argv: string[]): number {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${HELP}`)
    return EXIT.config
  }
  const { values, positionals } = parsed
  if (values.version) {
    console.log(VERSION)
    return EXIT.pass
  }
  const [command] = positionals
  if (values.help || !command) {
    console.log(HELP)
    return EXIT.pass
  }
  if (command === 'preflight') {
    const envFile = resolve(values['env-file'] ?? '.env.local')
    if (existsSync(envFile)) process.loadEnvFile(envFile)
    const result = preflight(process.env)
    for (const check of result.checks) {
      console.log(`${check.ok ? '✓' : '✗'} ${check.label.padEnd(22)} ${check.detail}`)
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

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      'env-file': { type: 'string' },
    },
  })
}

process.exitCode = main(process.argv.slice(2))
