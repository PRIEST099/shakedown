import { captureOrder, capturesOf, createOrder, PayPalApiError, usd } from '@shakedown/paypal'
import { cardOrderBody, client, describeError, short, spike } from './lib'

await spike(
  'S4',
  'Declines: negative-testing mocks and card rejection triggers',
  async (note, keep) => {
    // (a) Negative testing: a mocked INSTRUMENT_DECLINED on capture.
    const walletOrder = (
      await createOrder(client, {
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: 's4-mock', amount: usd('25.00') }],
      })
    ).data
    try {
      await captureOrder(client, walletOrder.id, { mock: 'INSTRUMENT_DECLINED' })
      note({
        claim: 'PayPal-Mock-Response forces INSTRUMENT_DECLINED on capture',
        verdict: 'REFUTED',
        evidence: 'capture succeeded',
      })
    } catch (error) {
      const ok = error instanceof PayPalApiError && error.issue === 'INSTRUMENT_DECLINED'
      keep(
        'mockError',
        error instanceof PayPalApiError
          ? { status: error.status, issue: error.issue, debugId: error.debugId }
          : String(error),
      )
      note({
        claim: 'PayPal-Mock-Response forces INSTRUMENT_DECLINED on capture',
        verdict: ok ? 'CONFIRMED' : 'REFUTED',
        evidence: describeError(error),
      })
    }

    // (b) A real card decline from a published rejection trigger in the cardholder name.
    try {
      const declined = (
        await createOrder(client, cardOrderBody('25.00', 's4-refused', 'CCREJECT-REFUSED'))
      ).data
      const capture = capturesOf(declined)[0] as
        | (ReturnType<typeof capturesOf>[number] & {
            processor_response?: { response_code?: string }
          })
        | undefined
      keep('declinedOrder', {
        id: declined.id,
        status: declined.status,
        capture: capture?.status,
        code: capture?.processor_response?.response_code,
      })
      note({
        claim: 'The CCREJECT-REFUSED trigger produces a real DECLINED card payment',
        verdict: capture?.status === 'DECLINED' ? 'CONFIRMED' : 'PARTIAL',
        evidence: `order ${short(declined.id)} ${declined.status} · capture ${capture?.status ?? 'none'} · processor code ${capture?.processor_response?.response_code ?? '—'}`,
      })
    } catch (error) {
      keep('declineError', describeError(error))
      note({
        claim: 'The CCREJECT-REFUSED trigger produces a real card decline',
        verdict: error instanceof PayPalApiError ? 'CONFIRMED' : 'REFUTED',
        evidence: `PayPal rejected the payment: ${describeError(error)}`,
      })
    }
  },
)
