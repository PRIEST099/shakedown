import {
  captureOrder,
  capturesOf,
  createOrder,
  getCapture,
  payerActionLink,
} from '@shakedown/paypal'
import { cardOrderBody, client, short, spike } from './lib'

await spike('S2', 'Headless create → capture with a PayPal test card', async (note, keep) => {
  const created = await createOrder(client, cardOrderBody('36.00', 's2'))
  const order0 = created.data
  const action = payerActionLink(order0)
  keep('createStatus', order0.status)
  note({
    claim: 'A card order can be created server-side',
    verdict: 'CONFIRMED',
    evidence: `order ${short(order0.id)} created with status ${order0.status}`,
  })
  note({
    claim: 'SCA_WHEN_REQUIRED with this test card asks for no 3DS / payer action',
    verdict: action ? 'REFUTED' : 'CONFIRMED',
    evidence: action ? 'PayPal returned a payer-action link' : 'no payer-action link returned',
  })
  if (action) return

  const order =
    order0.status === 'COMPLETED' ? order0 : (await captureOrder(client, order0.id)).data
  const capture = capturesOf(order)[0]
  keep('orderId', order.id)
  keep('captureId', capture?.id)
  keep('merchantId', order.purchase_units?.[0]?.payee?.merchant_id)
  note({
    claim: 'The payment is captured with no browser and no buyer approval',
    verdict: capture?.status === 'COMPLETED' ? 'CONFIRMED' : 'REFUTED',
    evidence: `${order0.status === 'COMPLETED' ? 'completed at create' : 'captured with a second call'} · capture ${short(capture?.id)} ${capture?.status} ${capture?.amount.value} ${capture?.amount.currency_code}`,
  })

  if (capture) {
    const read = await getCapture(client, capture.id)
    note({
      claim: 'The ledger can be read back through Payments v2',
      verdict: read.data.status === 'COMPLETED' ? 'CONFIRMED' : 'REFUTED',
      evidence: `GET /v2/payments/captures → ${read.data.status}, gross ${read.data.seller_receivable_breakdown?.gross_amount?.value ?? '?'}, fee ${read.data.seller_receivable_breakdown?.paypal_fee?.value ?? '?'}`,
    })
  }
})
