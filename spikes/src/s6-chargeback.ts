import { getDispute, listDisputes, refundCapture, usd } from '@shakedown/paypal'
import { client, describeError, headlessCardCapture, short, spike } from './lib'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

await spike(
  'S6',
  'Dispute simulator: a chargeback on a partly refunded card payment',
  async (note, keep) => {
    // The Second Opinion's setup: a $20 card payment, $10 already refunded.
    const { order, capture } = await headlessCardCapture('20.00', 's6')
    await refundCapture(client, capture.id, usd('10.00'))
    const merchantId = order.purchase_units?.[0]?.payee?.merchant_id
    keep('captureId', capture.id)
    keep('merchantId', merchantId)
    note({
      claim: 'Setup: a card capture with a partial refund',
      verdict: merchantId ? 'CONFIRMED' : 'PARTIAL',
      evidence: `capture ${short(capture.id)} 20.00, refunded 10.00 · merchant id ${merchantId ? 'found' : 'missing'}`,
    })

    const now = new Date()
    const inTenDays = new Date(now.getTime() + 10 * 24 * 3600 * 1000)
    const body = {
      adjacency: 'PAYPAL',
      file_layout: 'ATCK_CB',
      merchant_id: merchantId,
      financial_institution: { processor: 'FDMS' },
      transaction: { id_enc: capture.id, amount: usd('20.00') },
      instrument: {
        instrument_type: 'CARD',
        card_brand: 'VISA',
        credit_card_transaction_id: String(Date.now()).padEnd(16, '0'),
        external: false,
      },
      dispute: {
        id: null,
        stage: 'CHARGEBACK',
        response_date: inTenDays.toISOString(),
        status: '2',
        amount: usd('20.00'),
        receive_date: now.toISOString(),
        event_code: 'CHARGEBACK_INITIATED',
        money_movement_date: now.toISOString(),
        event_type: 'DEBIT',
        chargeback_type: 'REPORTED_TO_PROCESSOR',
        processor_info: {
          reference_number: `SHAKEDOWN${Date.now()}`,
          reason_code: '1330',
          notes: 'SHAKEDOWN_SPIKE',
        },
      },
    }

    let disputeId: string | undefined
    try {
      const res = await client.request<Record<string, unknown>>(
        'POST',
        '/v2/customer-support/process-chargeback',
        { body },
      )
      disputeId = typeof res.data?.dispute_id === 'string' ? res.data.dispute_id : undefined
      keep('chargebackResponse', { status: res.status, data: res.data })
      note({
        claim: 'process-chargeback opens a chargeback on a checkout card capture, headlessly',
        verdict: res.status === 201 || disputeId ? 'CONFIRMED' : 'PARTIAL',
        evidence: `HTTP ${res.status} · dispute ${short(disputeId)}`,
      })
    } catch (error) {
      keep('chargebackError', describeError(error))
      note({
        claim: 'process-chargeback opens a chargeback on a checkout card capture, headlessly',
        verdict: 'REFUTED',
        evidence: describeError(error),
      })
      return
    }

    // Disputes can take a moment to appear. Poll the dispute (or the list by transaction).
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const dispute = disputeId
          ? (await getDispute(client, disputeId)).data
          : (await listDisputes(client, { disputed_transaction_id: capture.id })).data.items?.[0]
        if (dispute) {
          keep('dispute', dispute)
          note({
            claim: 'The dispute is readable through the Disputes API, with its amount and stage',
            verdict: 'CONFIRMED',
            evidence: `status ${String(dispute.status)} · reason ${String(dispute.reason)} · stage ${String(dispute.dispute_life_cycle_stage)} · amount ${JSON.stringify(dispute.dispute_amount)}`,
          })
          return
        }
      } catch (error) {
        if (attempt === 9) {
          note({
            claim: 'The dispute is readable through the Disputes API',
            verdict: 'REFUTED',
            evidence: describeError(error),
          })
          return
        }
      }
      await sleep(3000)
    }
    note({
      claim: 'The dispute is readable through the Disputes API',
      verdict: 'PARTIAL',
      evidence: 'not visible after 30 s',
    })
  },
)
