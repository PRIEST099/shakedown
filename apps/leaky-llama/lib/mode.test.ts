import { signCampaignToken } from '@shakedown/core/campaign-token'
import { allLeaky, allSealed } from '@shakedown/core/mode'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeMode, encodeMode, MODE_COOKIE, readCookie, resolveMode } from './mode'
import { probeAuthorized } from './probe'

const secret = 'test-probe-secret-0123456789'
const original = process.env.SHAKEDOWN_PROBE_SECRET

afterEach(() => {
  if (original === undefined) delete process.env.SHAKEDOWN_PROBE_SECRET
  else process.env.SHAKEDOWN_PROBE_SECRET = original
})

const request = (headers: Record<string, string>) =>
  new Request('http://store.test/api', { headers })

describe('mode cookie', () => {
  it('round-trips through the comma list', () => {
    const mode = { ...allLeaky(), echo: 'sealed' as const, bouncer: 'sealed' as const }
    expect(encodeMode(mode)).toBe('echo,bouncer')
    expect(decodeMode('echo,bouncer')).toEqual(mode)
    expect(decodeMode('')).toEqual(allLeaky())
    expect(decodeMode('nonsense,echo')).toEqual({ ...allLeaky(), echo: 'sealed' })
  })

  it('reads one cookie out of many', () => {
    expect(readCookie('a=1; ll_mode=echo%2Cbouncer; b=2', MODE_COOKIE)).toBe('echo,bouncer')
    expect(readCookie(null, MODE_COOKIE)).toBeUndefined()
  })
})

describe('resolveMode', () => {
  it('defaults to every switch leaky', async () => {
    expect(await resolveMode(request({}))).toEqual({ mode: allLeaky(), source: 'default' })
  })

  it('uses the visitor cookie', async () => {
    const resolved = await resolveMode(request({ cookie: `${MODE_COOKIE}=echo` }))
    expect(resolved.source).toBe('visitor')
    expect(resolved.mode.echo).toBe('sealed')
  })

  it('prefers a signed campaign token over the cookie', async () => {
    process.env.SHAKEDOWN_PROBE_SECRET = secret
    const token = await signCampaignToken(
      { campaignId: 'CMP-9', exp: Date.now() + 60_000, mode: allSealed() },
      secret,
    )
    const resolved = await resolveMode(
      request({ 'x-shakedown-campaign': token, cookie: `${MODE_COOKIE}=` }),
    )
    expect(resolved).toEqual({ mode: allSealed(), campaignId: 'CMP-9', source: 'campaign' })
  })

  it('refuses a token it cannot check', async () => {
    process.env.SHAKEDOWN_PROBE_SECRET = secret
    await expect(
      resolveMode(request({ 'x-shakedown-campaign': 'v1.forged.token' })),
    ).rejects.toThrow()
    delete process.env.SHAKEDOWN_PROBE_SECRET
    await expect(resolveMode(request({ 'x-shakedown-campaign': 'anything' }))).rejects.toThrow(
      /no probe secret/,
    )
  })
})

describe('probeAuthorized', () => {
  it('needs the exact shared secret', () => {
    process.env.SHAKEDOWN_PROBE_SECRET = secret
    expect(probeAuthorized(request({ 'x-shakedown-probe': secret }))).toBe(true)
    expect(probeAuthorized(request({ 'x-shakedown-probe': `${secret}x` }))).toBe(false)
    expect(probeAuthorized(request({}))).toBe(false)
  })

  it('is closed when the store has no secret', () => {
    delete process.env.SHAKEDOWN_PROBE_SECRET
    expect(probeAuthorized(request({ 'x-shakedown-probe': '' }))).toBe(false)
  })
})
