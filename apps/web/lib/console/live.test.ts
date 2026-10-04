import type { Finding, RunEvent } from '@shakedown/core'
import { describe, expect, it } from 'vitest'
import { CONSOLE_HEADER, fromConsole, underLimit } from './guard'
import { toLiveEvents } from './live'

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
    const context: Parameters<typeof toLiveEvents>[1] = { campaignId: 'CMP-LIVE' }
    const events: RunEvent[] = [
      { type: 'scenario:started', persona: 'bouncer', scenario: 'bouncer.declined-card' },
      { type: 'finding', finding },
      { type: 'scenario:finished', persona: 'bouncer', findings: 1 },
    ]
    const live = events.flatMap((event) => toLiveEvents(event, context))
    expect(live.map((e) => e.type)).toEqual(['scenario', 'leak', 'scenario'])
    const [started, leak, finished] = live
    expect(started).toMatchObject({ state: 'running', persona: 'bouncer' })
    expect(finished).toMatchObject({ state: 'done', leaks: 1 })
    expect(started?.type === 'scenario' && started.title).not.toBe('bouncer.declined-card')
    expect(leak?.type === 'leak' && leak.row).toMatchObject({
      finding_key: 'CMP-LIVE:F-1',
      persona: 'The Bouncer',
      merchant_leak_usd: 36,
      paypal_ids: '12R908637G651884T',
    })
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
})
