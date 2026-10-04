import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { Finding } from '@shakedown/core'
import { type Database, schema } from '@shakedown/core/db'
import type { JobEvent } from '@shakedown/runs'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSOLE_HEADER, clientAddress, fromConsole, underLimit } from './guard'
import { type LiveContext, toLiveEvents } from './live'
import { databaseSpend } from './spend'
import { liveStatus } from './status'

const finding: Finding = {
  id: 'F-1',
  campaignId: 'CMP-LIVE',
  persona: 'bouncer',
  scenario: 'bouncer.declined-card',
  invariant: 'bouncer.no-ship-on-decline',
  title: 'A declined card never ships anything',
  severity: 'high',
  merchantLeakCents: 3600,
  customerHarmCents: 0,
  detail: 'Shipped on a declined card.',
  fix: 'Check the capture status.',
  evidence: [{ label: 'Capture at PayPal', value: '12R908637G651884T (DECLINED)' }],
  at: '2026-10-04T16:46:00.000Z',
}

describe('a live run, in the console’s terms', () => {
  it('names each scenario and turns each finding into a ready row', () => {
    const context: LiveContext = { campaignId: 'CMP-LIVE' }
    const events: JobEvent[] = [
      {
        type: 'job:started',
        runner: 'render-workflows',
        switches: 'leaky',
        cast: ['bouncer'],
        startedAt: '2026-10-04T16:45:00.000Z',
      },
      { type: 'job:customer', persona: 'bouncer', attempt: 1 },
      { type: 'scenario:started', persona: 'bouncer', scenario: 'bouncer.declined-card' },
      { type: 'finding', finding },
      { type: 'scenario:finished', persona: 'bouncer', findings: 1 },
      { type: 'job:stored', campaignId: 'CMP-LIVE' },
    ]
    const live = events.flatMap((event) => toLiveEvents(event, context))
    expect(live.map((e) => e.type)).toEqual(['started', 'scenario', 'leak', 'scenario', 'stored'])
    const [started, running, leak, finished] = live
    expect(started).toMatchObject({ campaignId: 'CMP-LIVE', switches: 'all leaky' })
    expect(running).toMatchObject({ state: 'running', persona: 'bouncer' })
    expect(finished).toMatchObject({ state: 'done', leaks: 1 })
    expect(running?.type === 'scenario' && running.title).not.toBe('bouncer.declined-card')
    expect(finished?.type === 'scenario' && finished.title).toBe(
      running?.type === 'scenario' && running.title,
    )
    expect(leak?.type === 'leak' && leak.row).toMatchObject({
      finding_key: 'CMP-LIVE:F-1',
      persona: 'The Bouncer',
      merchant_leak_usd: 36,
      paypal_ids: '12R908637G651884T',
    })
  })

  it('says when a customer is being run again, and how a run ended badly', () => {
    const context: LiveContext = { campaignId: 'CMP-LIVE' }
    expect(toLiveEvents({ type: 'job:customer', persona: 'echo', attempt: 2 }, context)).toEqual([
      { type: 'retry', campaignId: 'CMP-LIVE', persona: 'echo' },
    ])
    expect(toLiveEvents({ type: 'job:failed', reason: 'Gone.' }, context)).toEqual([
      { type: 'failed', reason: 'Gone.' },
    ])
  })

  it('passes nothing else through', () => {
    expect(
      toLiveEvents(
        { type: 'campaign:started', campaignId: 'X', seed: 1, cast: [] },
        { campaignId: 'X' },
      ),
    ).toEqual([])
  })
})

describe('the console guard', () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/console/llm', { method: 'POST', headers })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts only requests carrying the console header', () => {
    expect(fromConsole(request({ [CONSOLE_HEADER]: '1' }))).toBe(true)
    expect(fromConsole(request())).toBe(false)
  })

  it('limits each address per route', () => {
    const from = (ip: string) => request({ 'x-forwarded-for': ip })
    const route = `test-${Date.now()}`
    expect([1, 2, 3].map(() => underLimit(from('10.0.0.1'), route, 2, 60_000))).toEqual([
      true,
      true,
      false,
    ])
    expect(underLimit(from('10.0.0.2'), route, 2, 60_000)).toBe(true)
  })

  it('on Render, trusts the address Cloudflare wrote over one the caller wrote', () => {
    const spoofed = request({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '203.0.113.9' })
    expect(clientAddress(spoofed)).toBe('1.2.3.4')
    vi.stubEnv('RENDER', 'true')
    expect(clientAddress(spoofed)).toBe('203.0.113.9')
  })
})

describe('the hosted spend ledger', () => {
  it('adds up exactly, per purpose and in all', async () => {
    const pg = drizzle(new PGlite(), { schema })
    await migrate(pg, {
      migrationsFolder: path.resolve(import.meta.dirname, '../../../../packages/core/drizzle'),
    })
    const spend = databaseSpend(pg as unknown as Database)
    const record = (purpose: string, costUsd: number) =>
      spend.record({
        at: '2026-10-04T18:00:00.000Z',
        model: 'claude-haiku-4-5',
        purpose,
        inputTokens: 1000,
        outputTokens: 200,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        costUsd,
      })
    expect(await spend.total()).toBe(0)
    await record('console', 0.0054)
    await record('console', 0.0339)
    await record('other', 0.1)
    expect(await spend.spentOn('console')).toBeCloseTo(0.0393, 10)
    expect(await spend.total()).toBeCloseTo(0.1393, 10)
  })
})

describe('whether a live run can work', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const answering = (store: boolean, paypal: boolean) =>
    (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.endsWith('/api/health')) {
        return store ? Response.json({ ok: true }) : new Response('', { status: 502 })
      }
      if (url.includes('/v1/oauth2/token')) {
        return paypal
          ? Response.json({ access_token: 'test-token', expires_in: 3600, scope: '' })
          : new Response('', { status: 503 })
      }
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch

  const ready = () => {
    vi.stubEnv('SHAKEDOWN_CONSOLE_LIVE', '')
    vi.stubEnv('SHAKEDOWN_PROBE_SECRET', 'a-test-secret-of-16+')
    vi.stubEnv('PAYPAL_CLIENT_ID', 'test-client')
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-secret')
    vi.stubEnv('LEAKY_LLAMA_URL', 'http://store.test')
    vi.stubEnv('SHAKEDOWN_WORKFLOW', '')
    vi.stubEnv('RENDER_API_KEY', '')
  }

  it('says why not: switched off, not set up, the store, or PayPal', async () => {
    ready()
    const check = (fetch: typeof globalThis.fetch) => liveStatus({ fetch, fresh: true })
    expect(await check(answering(true, true))).toMatchObject({ live: true, runner: 'in-process' })
    expect(await check(answering(false, true))).toMatchObject({ live: false, reason: 'store' })
    expect(await check(answering(true, false))).toMatchObject({ live: false, reason: 'paypal' })
    vi.stubEnv('PAYPAL_CLIENT_SECRET', '')
    expect(await check(answering(true, true))).toMatchObject({ live: false, reason: 'setup' })
    vi.stubEnv('SHAKEDOWN_CONSOLE_LIVE', '0')
    expect(await check(answering(true, true))).toMatchObject({ live: false, reason: 'off' })
  })

  it('names Render Workflows as the runner once it is set up', async () => {
    ready()
    vi.stubEnv('SHAKEDOWN_WORKFLOW', 'shakedown-runs')
    vi.stubEnv('RENDER_API_KEY', 'rnd_test_not_real')
    expect(await liveStatus({ fetch: answering(true, true), fresh: true })).toMatchObject({
      live: true,
      runner: 'render-workflows',
    })
  })
})
