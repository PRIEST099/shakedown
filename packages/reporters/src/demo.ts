/**
 * Phase 2, in one terminal run: the Echo against a listener left as people ship it, then the
 * same run against a sealed one. Everything here is local — a fixture listener on 127.0.0.1,
 * no PayPal call, no money.
 *
 *   pnpm --filter @shakedown/reporters demo
 */
import { runCampaign } from '@shakedown/core'
import { LEAKY, SEALED, startFixtureTarget } from '@shakedown/core/testing'
import { scoreboard } from './scoreboard'

const seed = Number(process.argv[2] ?? 2026)

const fixture = await startFixtureTarget({ flags: LEAKY })

try {
  console.log('\n  Before — the listener as most integrations ship it')
  console.log(scoreboard(await runCampaign({ target: fixture.adapter, cast: ['echo'], seed })))

  fixture.reset()
  fixture.setFlags(SEALED)

  console.log('\n  After — verify the signature, skip repeats, ignore stale events')
  console.log(scoreboard(await runCampaign({ target: fixture.adapter, cast: ['echo'], seed })))
} finally {
  await fixture.close()
}
