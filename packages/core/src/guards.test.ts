import { describe, expect, it } from 'vitest'
import {
  assertTargetAllowed,
  TargetNotAllowedError,
  VERIFICATION_PATH,
  verifyTargetOwnership,
} from './guards'

describe('assertTargetAllowed', () => {
  it('lets local and private targets through without ceremony', () => {
    for (const url of [
      'http://localhost:3100/webhooks',
      'http://127.0.0.1:8080',
      'https://store.localhost',
      'http://10.0.0.4',
      'http://192.168.1.20:3000',
      'http://172.16.3.1',
      'http://shop.test',
    ]) {
      expect(assertTargetAllowed(url).trust).toBe('local')
    }
  })

  it('refuses a public host that was not allow-listed', () => {
    expect(() => assertTargetAllowed('https://store.example.com')).toThrow(TargetNotAllowedError)
    expect(() => assertTargetAllowed('https://store.example.com')).toThrow(VERIFICATION_PATH)
  })

  it('refuses an allow-listed host with no token to check', () => {
    expect(() =>
      assertTargetAllowed('https://store.example.com', { allowHosts: ['store.example.com'] }),
    ).toThrow(/only runs against integrations you own/)
  })

  it('accepts an allow-listed host once a token is configured', () => {
    const target = assertTargetAllowed('https://store.example.com/hook', {
      allowHosts: ['Store.Example.com'],
      verificationToken: 'token-123',
    })
    expect(target.trust).toBe('verified')
    expect(target.url.hostname).toBe('store.example.com')
  })

  it('refuses credentials in the URL and non-http schemes', () => {
    expect(() => assertTargetAllowed('https://user:pass@localhost/hook')).toThrow(/credentials/)
    expect(() => assertTargetAllowed('file:///etc/passwd')).toThrow(/http or https/)
    expect(() => assertTargetAllowed('not a url')).toThrow(/invalid target URL/)
  })
})

describe('verifyTargetOwnership', () => {
  const target = { url: new URL('https://store.example.com/hook'), trust: 'verified' } as const
  const policy = { verificationToken: 'token-123' }

  it('skips the check for local targets', async () => {
    await expect(
      verifyTargetOwnership({ url: new URL('http://localhost:3100'), trust: 'local' }, {}),
    ).resolves.toBeUndefined()
  })

  it('passes when the token is served at the well-known path', async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      expect(String(input)).toBe(`https://store.example.com${VERIFICATION_PATH}`)
      return new Response('token-123\n')
    }
    await expect(
      verifyTargetOwnership(target, policy, fetchImpl as typeof fetch),
    ).resolves.toBeUndefined()
  })

  it('refuses when the served token does not match', async () => {
    const fetchImpl = async () => new Response('someone-elses-token')
    await expect(verifyTargetOwnership(target, policy, fetchImpl as typeof fetch)).rejects.toThrow(
      /does not match/,
    )
  })

  it('refuses when the file is missing', async () => {
    const fetchImpl = async () => new Response('nope', { status: 404 })
    await expect(verifyTargetOwnership(target, policy, fetchImpl as typeof fetch)).rejects.toThrow(
      /HTTP 404/,
    )
  })
})
