import { getCapture, getRefund, PayPalApiError, refundCapture, usd } from '@shakedown/paypal'
import { client, describeError, headlessCardCapture, short, spike } from './lib'

await spike(
  'S5',
  'Refunds: partial, idempotent replay, the refund cap, full',
  async (note, keep) => {
    const { capture } = await headlessCardCapture('45.00', 's5')
    keep('captureId', capture.id)

    // Partial refund with an explicit idempotency key, then the same request replayed.
    const key = crypto.randomUUID()
    const first = (await refundCapture(client, capture.id, usd('18.00'), { requestId: key })).data
    const replay = (await refundCapture(client, capture.id, usd('18.00'), { requestId: key })).data
    keep('refundId', first.id)
    note({
      claim: 'A partial refund completes',
      verdict: first.status === 'COMPLETED' ? 'CONFIRMED' : 'PARTIAL',
      evidence: `refund ${short(first.id)} ${first.status} 18.00 of 45.00`,
    })
    note({
      claim: 'Replaying a refund with the same PayPal-Request-Id does not refund twice',
      verdict: replay.id === first.id ? 'CONFIRMED' : 'REFUTED',
      evidence:
        replay.id === first.id
          ? `replay returned the same refund ${short(first.id)}`
          : `replay created a NEW refund ${short(replay.id)}`,
    })

    const afterPartial = (await getCapture(client, capture.id)).data
    const readRefund = (await getRefund(client, first.id)).data
    note({
      claim: 'Capture and refund state are readable from the ledger',
      verdict:
        afterPartial.status === 'PARTIALLY_REFUNDED' && readRefund.status === 'COMPLETED'
          ? 'CONFIRMED'
          : 'PARTIAL',
      evidence: `capture ${afterPartial.status} · refund ${readRefund.status}`,
    })

    // Asking for more than what is left: PayPal must refuse (this caps the "leak" math honestly).
    try {
      await refundCapture(client, capture.id, usd('30.00'))
      note({
        claim: 'PayPal refuses a refund above the remaining amount',
        verdict: 'REFUTED',
        evidence: 'over-refund accepted',
      })
    } catch (error) {
      keep(
        'overRefundError',
        error instanceof PayPalApiError
          ? { status: error.status, issue: error.issue }
          : String(error),
      )
      note({
        claim: 'PayPal refuses a refund above the remaining amount',
        verdict: error instanceof PayPalApiError ? 'CONFIRMED' : 'REFUTED',
        evidence: describeError(error),
      })
    }

    // No amount = refund whatever is left.
    const rest = (await refundCapture(client, capture.id)).data
    const final = (await getCapture(client, capture.id)).data
    note({
      claim: 'Refunding the remainder leaves the capture fully REFUNDED',
      verdict: final.status === 'REFUNDED' ? 'CONFIRMED' : 'PARTIAL',
      evidence: `remainder refund ${short(rest.id)} ${rest.status} ${rest.amount?.value ?? '?'} · capture now ${final.status}`,
    })
  },
)
