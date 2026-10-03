import { SandboxLockError } from '@shakedown/paypal'
import { client, spike } from './lib'

await spike('S1', 'OAuth client-credentials, token cache, sandbox lock', async (note, keep) => {
  const t0 = performance.now()
  const token = await client.accessToken()
  const t1 = performance.now()
  note({
    claim: 'The sandbox issues a client-credentials token for your app',
    verdict: token.length > 20 ? 'CONFIRMED' : 'REFUTED',
    evidence: `token received (${token.length} chars, not shown) in ${Math.round(t1 - t0)} ms`,
  })

  const again = await client.accessToken()
  note({
    claim: 'The token is cached and reused',
    verdict: again === token ? 'CONFIRMED' : 'REFUTED',
    evidence: `second call took ${Math.round(performance.now() - t1)} ms`,
  })

  const scopes = client.grantedScopes()
  const has = (fragment: string) => scopes.some((scope) => scope.includes(fragment))
  keep('scopes', scopes)
  note({
    claim: 'The app has the scopes the cast needs',
    verdict:
      has('payments/payment') && has('disputes') && has('webhooks') ? 'CONFIRMED' : 'PARTIAL',
    evidence: `${scopes.length} scopes · payments ${has('payments/payment')} · disputes ${has('disputes')} · webhooks ${has('webhooks')} · payouts ${has('payouts')}`,
  })

  try {
    await client.request('GET', 'https://api-m.paypal.com/v2/checkout/orders/ANY')
    note({
      claim: 'The sandbox lock refuses live hosts',
      verdict: 'REFUTED',
      evidence: 'live call went out',
    })
  } catch (error) {
    note({
      claim: 'The sandbox lock refuses live hosts',
      verdict: error instanceof SandboxLockError ? 'CONFIRMED' : 'REFUTED',
      evidence: (error as Error).message,
    })
  }
})
