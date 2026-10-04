import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FixtureTarget } from '@shakedown/core/testing'
import { LEAKY, SEALED, startFixtureTarget } from '@shakedown/core/testing'
import { parseReport } from '@shakedown/reporters'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EXIT } from './exit-codes'
import { OUTPUT_FILES } from './outputs'
import { combine, preflightTarget } from './preflight'
import { reportCommand } from './report'
import { type AiKit, type RunIo, runCommand } from './run'

const SECRET = 'probe-secret-for-tests-only'
let fixture: FixtureTarget

beforeAll(async () => {
  fixture = await startFixtureTarget({ flags: LEAKY })
})
afterAll(() => fixture.close())
beforeEach(() => fixture.reset())

function harness(over: Partial<RunIo> = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'shakedown-run-'))
  const lines: string[] = []
  const printed: string[] = []
  const io: RunIo = {
    cwd,
    env: { SHAKEDOWN_PROBE_SECRET: SECRET },
    version: '9.9.9',
    print: (text) => {
      printed.push(text)
    },
    log: (line) => {
      lines.push(line)
    },
    connect: async () => fixture.adapter,
    ...over,
  }
  const report = () =>
    parseReport(readFileSync(path.join(cwd, '.shakedown', OUTPUT_FILES.json), 'utf8'))
  return { io, cwd, lines, printed, report, log: () => lines.join('\n') }
}

const fakeAi =
  (calls: string[], fail?: unknown): (() => Promise<AiKit>) =>
  async () => ({
    spent: () => 0.0012,
    compilePolicy: async (text) => {
      calls.push(`policy:${text.length}`)
      if (fail) throw fail
      return {
        windowDays: 30,
        selfServeLimitCents: 5000,
        capAtAmountPaid: true,
        requiresOrderEmail: true,
        noRefundDuringDispute: true,
      }
    },
    explain: async (finding) => {
      calls.push(`explain:${finding.id}`)
      if (fail) throw fail
      return { headline: 'h', explanation: `plain words for ${finding.invariant}`, firstStep: 's' }
    },
  })

describe('run', () => {
  it('exits 1 on a leak and leaves every report behind', async () => {
    fixture.setFlags(LEAKY)
    const h = harness()
    const code = await runCommand({ target: fixture.origin, cast: 'echo' }, h.io)

    expect(code).toBe(EXIT.leaks)
    for (const file of Object.values(OUTPUT_FILES)) {
      expect(existsSync(path.join(h.cwd, '.shakedown', file))).toBe(true)
    }
    const report = h.report()
    expect(report.totals.leaks).toBeGreaterThan(0)
    expect(report.tool).toEqual({ name: '@shakedown-dev/cli', version: '9.9.9' })
    expect(report.ai).toBeUndefined()
    expect(h.printed.join('')).toContain('LEAKS')
    expect(h.log()).toMatch(/✗ The Echo · .+ \(\d leaks?\)/)
  })

  it('exits 0 when the store holds', async () => {
    fixture.setFlags(SEALED)
    const h = harness()
    expect(await runCommand({ target: fixture.origin, cast: 'echo', strict: true }, h.io)).toBe(
      EXIT.pass,
    )
    expect(h.report().totals.leaks).toBe(0)
  })

  it('skips the checkout customers without PayPal credentials, and strict mode says so', async () => {
    fixture.setFlags(SEALED)
    const h = harness()
    expect(await runCommand({ target: fixture.origin }, h.io)).toBe(EXIT.pass)
    expect(h.log()).toContain('PayPal sandbox credentials are not set')
    expect(h.report().totals.skipped).toBeGreaterThan(0)

    expect(await runCommand({ target: fixture.origin, strict: true }, harness().io)).toBe(
      EXIT.inconclusive,
    )
  })

  it('replays the same campaign from the same seed', async () => {
    fixture.setFlags(LEAKY)
    const first = harness()
    const second = harness()
    await runCommand({ target: fixture.origin, cast: 'echo', seed: '42' }, first.io)
    fixture.reset()
    await runCommand({ target: fixture.origin, cast: 'echo', seed: '42' }, second.io)
    // Timestamps differ; every verdict, amount and ID must not.
    const outcome = (r: ReturnType<typeof first.report>) => ({
      campaign: r.campaign.id,
      totals: r.totals,
      checks: r.personas.flatMap((p) =>
        p.scenarios.flatMap((s) =>
          s.checks.map((c) => [
            c.invariant,
            c.verdict,
            c.findingId,
            c.merchantLeakCents,
            c.customerHarmCents,
          ]),
        ),
      ),
    })
    expect(outcome(second.report())).toEqual(outcome(first.report()))
  })

  it('loads Claude only when the run asks for it, and explains each leak', async () => {
    fixture.setFlags(LEAKY)
    const calls: string[] = []
    const quiet = harness({ ai: fakeAi(calls) })
    await runCommand({ target: fixture.origin, cast: 'echo' }, quiet.io)
    expect(calls).toEqual([])

    const h = harness({ ai: fakeAi(calls) })
    await runCommand({ target: fixture.origin, cast: 'echo', explain: true }, h.io)
    const report = h.report()
    const leaks = report.personas
      .flatMap((p) => p.scenarios.flatMap((s) => s.checks))
      .filter((c) => c.verdict === 'leak')
    expect(calls).toHaveLength(leaks.length)
    expect(leaks.every((leak) => leak.explanation?.explanation.startsWith('plain words'))).toBe(
      true,
    )
    expect(report.ai).toEqual({ spentUsd: 0.0012 })
  })

  it('stops explaining when the AI budget runs out, and still reports', async () => {
    fixture.setFlags(LEAKY)
    const calls: string[] = []
    const h = harness({ ai: fakeAi(calls, { status: 402, message: 'budget' }) })
    expect(await runCommand({ target: fixture.origin, cast: 'echo', explain: true }, h.io)).toBe(
      EXIT.leaks,
    )
    expect(calls).toHaveLength(1)
    expect(h.log()).toContain('pass --budget 0.02')
  })

  it('refuses a store it may not test, before sending anything', async () => {
    const h = harness({ connect: undefined, fetch: async () => expect.unreachable() })
    expect(await runCommand({ target: 'https://shop.example.com' }, h.io)).toBe(EXIT.safetyLock)
    expect(h.log()).toContain('Safety lock: Refused shop.example.com')
  })

  it('refuses the live PayPal environment', async () => {
    const h = harness({ env: { SHAKEDOWN_PROBE_SECRET: SECRET, PAYPAL_ENV: 'live' } })
    expect(await runCommand({ target: fixture.origin }, h.io)).toBe(EXIT.safetyLock)
  })

  it('exits 5 when the store is not answering, and 4 without a probe secret', async () => {
    const down = harness({ connect: undefined })
    expect(await runCommand({ target: 'http://127.0.0.1:9' }, down.io)).toBe(EXIT.preflight)
    expect(down.log()).toContain('Is the store running?')

    const noSecret = harness({ env: {} })
    expect(await runCommand({ target: fixture.origin }, noSecret.io)).toBe(EXIT.config)
  })
})

describe('report', () => {
  it('prints the last run in any format without re-running it', async () => {
    fixture.setFlags(LEAKY)
    const h = harness()
    await runCommand({ target: fixture.origin, cast: 'echo' }, h.io)
    const out: string[] = []
    const io = {
      cwd: h.cwd,
      print: (text: string) => void out.push(text),
      log: (line: string) => void out.push(line),
    }

    expect(await reportCommand({ format: 'markdown' }, io)).toBe(EXIT.pass)
    expect(out.pop()).toContain('<!-- shakedown:report -->')
    await reportCommand({ format: 'junit' }, io)
    expect(out.pop()).toContain('<testsuites')
    await reportCommand({ format: 'terminal' }, io)
    expect(out.pop()).toContain('MERCHANT LEAK')

    const opened: string[] = []
    await reportCommand({}, { ...io, open: (file) => opened.push(file) > 0 })
    expect(opened[0]).toMatch(/\.shakedown\/report\.html$/)
    await reportCommand({ ci: true }, { ...io, open: () => expect.unreachable() })
  })

  it('says how to get a report when there is none', async () => {
    const lines: string[] = []
    const code = await reportCommand(
      {},
      { cwd: harness().cwd, print: () => {}, log: (l) => void lines.push(l) },
    )
    expect(code).toBe(EXIT.config)
    expect(lines[0]).toContain('npx @shakedown-dev/cli run')
  })
})

describe('preflight against a store', () => {
  let server: Server
  let origin = ''
  let openProbe = false

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/api/catalog') return res.end('{"items":[{},{}]}')
      if (req.url?.startsWith('/api/probe/')) {
        const authorised = openProbe || req.headers['x-shakedown-probe'] === SECRET
        res.statusCode = authorised ? 404 : 403
        return res.end('{}')
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('passes a store that answers and guards its probe API', async () => {
    const result = await preflightTarget({ url: origin, probeSecret: SECRET })
    expect(result.exitCode).toBe(EXIT.pass)
    expect(result.checks.map((c) => c.detail).join(' ')).toContain('2 products')
  })

  it('fails a wrong secret, and a probe API that answers anyone', async () => {
    expect(
      (await preflightTarget({ url: origin, probeSecret: 'another-secret-entirely' })).exitCode,
    ).toBe(EXIT.preflight)
    openProbe = true
    const open = await preflightTarget({ url: origin, probeSecret: SECRET })
    openProbe = false
    expect(open.exitCode).toBe(EXIT.preflight)
    expect(open.checks.at(-1)?.detail).toContain('answered without the secret')
  })

  it('stops at the safety lock for a store you have not verified, and at a dead port', async () => {
    const locked = await preflightTarget({
      url: 'https://shop.example.com',
      fetch: async () => expect.unreachable(),
    })
    expect(locked.exitCode).toBe(EXIT.safetyLock)
    expect((await preflightTarget({ url: 'http://127.0.0.1:9' })).exitCode).toBe(EXIT.preflight)
  })

  it('reports the worst problem first when combining checks', () => {
    const pass = { exitCode: EXIT.pass, checks: [] }
    expect(
      combine(
        pass,
        { exitCode: EXIT.preflight, checks: [] },
        { exitCode: EXIT.safetyLock, checks: [] },
      ).exitCode,
    ).toBe(EXIT.safetyLock)
    expect(combine(pass, pass).exitCode).toBe(EXIT.pass)
  })
})
