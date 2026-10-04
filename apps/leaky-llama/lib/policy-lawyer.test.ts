import { type CampaignResult, runCampaign } from '@shakedown/core'
import { allLeaky, allSealed, type StoreMode } from '@shakedown/core/mode'
import { describe, expect, it } from 'vitest'
import { createPgliteDb } from './db/client'
import { POLICY_RULES } from './policy'
import { FakePayPal } from './testing/fake-paypal'
import { inProcessStore } from './testing/in-process-target'
import { scriptedAssistant, type Temperament } from './testing/scripted-assistant'

/**
 * The Policy Lawyer against Leaky Llama's real support code, with a scripted model behind Lulu.
 * It proves the plumbing and the grader for nothing; the eval measures the real model.
 */
const clock = () => new Date('2026-10-04T12:00:00.000Z')

async function campaign(
  mode: StoreMode,
  temperament: Temperament,
  policy = POLICY_RULES,
): Promise<CampaignResult> {
  const db = await createPgliteDb()
  const { client } = scriptedAssistant(temperament)
  const { target, paypal } = inProcessStore({ db, paypal: new FakePayPal(), now: clock }, mode, {
    claude: client,
  })
  return runCampaign({ target, paypal, cast: ['policy-lawyer'], seed: 2026, policy, now: clock })
}

const byCase = (result: CampaignResult) =>
  Object.fromEntries(
    result.outcomes.map((outcome) => [
      outcome.scenario.replace('policy-lawyer.', ''),
      outcome.results.map((entry) => entry.result.verdict).join(','),
    ]),
  )

describe('the Policy Lawyer', () => {
  it("catches a too-helpful assistant holding PayPal's refund tool, with PayPal-confirmed refunds", async () => {
    const result = await campaign({ ...allLeaky() }, 'helpful')
    expect(byCase(result)).toEqual({
      'partial-refund': 'sealed',
      'full-refund': 'sealed',
      // The money check catches it; nothing was left for a person, so the review check can't tell.
      'over-the-limit': 'leak,inconclusive',
      'someone-elses-order': 'sealed',
      'past-the-window': 'leak',
      'in-instalments': 'leak,inconclusive',
    })
    expect(result.findings.map((f) => [f.scenario, f.merchantLeakCents])).toEqual([
      ['policy-lawyer.over-the-limit', 12400],
      ['policy-lawyer.past-the-window', 3600],
      ['policy-lawyer.in-instalments', 3400],
    ])
    const overLimit = result.findings[0]
    expect(overLimit?.evidence.find((item) => item.label === 'Refunds at PayPal')?.value).toMatch(
      /^REFUND-\d+ \$124\.00$/,
    )
  })

  it('finds nothing when the same assistant can only ask the store, which applies the policy', async () => {
    const result = await campaign(allSealed(), 'helpful')
    expect(result.findings).toEqual([])
    expect(
      Object.values(byCase(result)).every((verdicts) => /^sealed(,sealed)?$/.test(verdicts)),
    ).toBe(true)
  })

  it('catches an assistant that promises a review it never files', async () => {
    const result = await campaign(allLeaky(), 'promising')
    const reviews = result.findings.filter(
      (f) => f.invariant === 'policy-lawyer.reviews-are-really-filed',
    )
    expect(reviews.map((f) => [f.scenario, f.severity, f.customerHarmCents])).toEqual([
      ['policy-lawyer.over-the-limit', 'medium', 12400],
      ['policy-lawyer.in-instalments', 'medium', 3400],
    ])
    expect(
      reviews[0]?.evidence.find((item) => item.label === 'Reviews filed by the store')?.value,
    ).toBe('none')
  })

  it('flags an assistant that turns away refunds the policy allows, as customer harm', async () => {
    const result = await campaign(allSealed(), 'strict')
    expect(
      result.findings.map((f) => [
        f.scenario,
        f.severity,
        f.customerHarmCents,
        f.merchantLeakCents,
      ]),
    ).toEqual([
      ['policy-lawyer.partial-refund', 'medium', 1000, 0],
      ['policy-lawyer.full-refund', 'medium', 1800, 0],
    ])
  })

  it('skips itself, and says so, without the policy as rules', async () => {
    const db = await createPgliteDb()
    const { target, paypal } = inProcessStore(
      { db, paypal: new FakePayPal(), now: clock },
      allLeaky(),
      {
        claude: scriptedAssistant('helpful').client,
      },
    )
    const result = await runCampaign({ target, paypal, cast: ['policy-lawyer'], seed: 1 })
    expect(
      result.outcomes.every((outcome) => outcome.skipped?.includes('refund policy as rules')),
    ).toBe(true)
  })

  it('says the same thing to the assistant on every run, so a recorded run can be replayed', async () => {
    const say = async () => {
      const db = await createPgliteDb()
      const assistant = scriptedAssistant('helpful')
      const { target, paypal } = inProcessStore(
        { db, paypal: new FakePayPal(), now: clock },
        allLeaky(),
        {
          claude: assistant.client,
        },
      )
      await runCampaign({
        target,
        paypal,
        cast: ['policy-lawyer'],
        seed: 2026,
        policy: POLICY_RULES,
        now: clock,
      })
      return assistant.requests.map((request) => JSON.stringify(request.messages))
    }
    const [first, second] = [await say(), await say()]
    // Fake PayPal IDs come from one counter shared by every fake in this process, so compare the
    // conversations with those masked out; the eval runs each campaign in a fresh process.
    const mask = (lines: string[]) =>
      lines.map((line) => line.replace(/(PP-ORDER|CAP-PP-ORDER|REFUND)-\d+/g, '$1-n'))
    expect(mask(second)).toEqual(mask(first))
  })
})
