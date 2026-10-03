import { describe, expect, it } from 'vitest'
import { CampaignTokenError, signCampaignToken, verifyCampaignToken } from './campaign-token'
import { allLeaky, allSealed } from './mode'

const secret = 'a-test-secret-of-plenty-length'
const now = Date.UTC(2026, 9, 3)

describe('campaign tokens', () => {
  it('round-trips the campaign and its switches', async () => {
    const mode = { ...allLeaky(), echo: 'sealed' as const }
    const token = await signCampaignToken({ campaignId: 'CMP-1', exp: now + 60_000, mode }, secret)
    const claims = await verifyCampaignToken(token, secret, now)
    expect(claims.campaignId).toBe('CMP-1')
    expect(claims.mode).toEqual(mode)
  })

  it('refuses a token signed with a different secret', async () => {
    const token = await signCampaignToken({ campaignId: 'CMP-1', exp: now + 60_000 }, secret)
    await expect(
      verifyCampaignToken(token, 'another-secret-of-plenty-length', now),
    ).rejects.toThrow(/signature/)
  })

  it('refuses a token whose switches were edited after signing', async () => {
    const token = await signCampaignToken(
      { campaignId: 'CMP-1', exp: now + 60_000, mode: allLeaky() },
      secret,
    )
    const [version, , signature] = token.split('.')
    const edited = btoa(
      JSON.stringify({ campaignId: 'CMP-1', exp: now + 60_000, mode: allSealed() }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    await expect(
      verifyCampaignToken(`${version}.${edited}.${signature}`, secret, now),
    ).rejects.toThrow(CampaignTokenError)
  })

  it('refuses an expired token', async () => {
    const token = await signCampaignToken({ campaignId: 'CMP-1', exp: now - 1 }, secret)
    await expect(verifyCampaignToken(token, secret, now)).rejects.toThrow(/expired/)
  })

  it('refuses garbage without throwing anything but its own error', async () => {
    for (const bad of ['', 'v1', 'v1..', 'v2.abc.def', 'v1.!!!.???']) {
      await expect(verifyCampaignToken(bad, secret, now)).rejects.toThrow(CampaignTokenError)
    }
  })

  it('will not sign with a short secret', async () => {
    await expect(signCampaignToken({ campaignId: 'C', exp: now }, 'short')).rejects.toThrow(/short/)
  })

  it('cleans up switch values it does not recognise', async () => {
    const token = await signCampaignToken(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
      { campaignId: 'CMP-1', exp: now + 1000, mode: { echo: 'sealed', bouncer: 'maybe' } as any },
      secret,
    )
    const claims = await verifyCampaignToken(token, secret, now)
    expect(claims.mode?.echo).toBe('sealed')
    expect(claims.mode?.bouncer).toBe('leaky')
  })
})
