import { describe, expect, it } from 'vitest'
import { assertSandboxApiUrl, SandboxLockError, sandboxApiUrl } from './sandbox-lock'

describe('sandbox lock', () => {
  it('allows the PayPal sandbox API hosts', () => {
    expect(
      assertSandboxApiUrl('https://api-m.sandbox.paypal.com/v2/checkout/orders').pathname,
    ).toBe('/v2/checkout/orders')
    expect(assertSandboxApiUrl('https://api.sandbox.paypal.com/v1/oauth2/token').hostname).toBe(
      'api.sandbox.paypal.com',
    )
  })

  it.each([
    ['the live API', 'https://api-m.paypal.com/v2/checkout/orders'],
    ['plain http', 'http://api-m.sandbox.paypal.com/v2/checkout/orders'],
    ['a lookalike suffix', 'https://api-m.sandbox.paypal.com.example.com/v1'],
    ['a lookalike prefix', 'https://evil-api-m.sandbox.paypal.com/v1'],
    ['embedded credentials', 'https://api-m.sandbox.paypal.com@example.com/v1'],
    ['a non-default port', 'https://api-m.sandbox.paypal.com:8443/v1'],
    ['garbage', 'not a url'],
  ])('refuses %s', (_label, url) => {
    expect(() => assertSandboxApiUrl(url)).toThrow(SandboxLockError)
  })

  it('cannot be escaped with a protocol-relative path', () => {
    expect(() => sandboxApiUrl('//api-m.paypal.com/v2/checkout/orders')).toThrow(SandboxLockError)
    expect(sandboxApiUrl('/v2/checkout/orders').href).toBe(
      'https://api-m.sandbox.paypal.com/v2/checkout/orders',
    )
  })
})
