import {
  captureOrder,
  capturesOf,
  createOrder,
  type Order,
  payerActionLink,
  usd,
} from '@shakedown/paypal'
import { client, short, spike, testCard } from './lib'

// How a real card form works: the store creates the order, the buyer's card is attached with
// confirm-payment-source, then the store captures. Can a test customer do the middle step headlessly?
await spike(
  'S8',
  'Store-created order, paid by card via confirm-payment-source',
  async (note, keep) => {
    const created = (
      await createOrder(client, {
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: 's8', amount: usd('30.00') }],
      })
    ).data
    note({
      claim: 'The store creates an order with no payment source',
      verdict: created.status === 'CREATED' ? 'CONFIRMED' : 'PARTIAL',
      evidence: `order ${short(created.id)} ${created.status}`,
    })

    const confirmed = (
      await client.request<Order>(
        'POST',
        `/v2/checkout/orders/${created.id}/confirm-payment-source`,
        {
          body: {
            payment_source: {
              card: {
                ...testCard(),
                attributes: { verification: { method: 'SCA_WHEN_REQUIRED' } },
              },
            },
          },
        },
      )
    ).data
    keep('confirmStatus', confirmed.status)
    note({
      claim: 'A test card attached with confirm-payment-source approves it, with no 3DS',
      verdict:
        confirmed.status === 'APPROVED' && !payerActionLink(confirmed) ? 'CONFIRMED' : 'PARTIAL',
      evidence: `status ${confirmed.status}${payerActionLink(confirmed) ? ' · payer-action link returned' : ''}`,
    })

    const captured = (await captureOrder(client, created.id)).data
    const capture = capturesOf(captured)[0]
    keep('captureId', capture?.id)
    note({
      claim: 'The store then captures it',
      verdict: capture?.status === 'COMPLETED' ? 'CONFIRMED' : 'REFUTED',
      evidence: `order ${captured.status} · capture ${short(capture?.id)} ${capture?.status} ${capture?.amount.value}`,
    })
  },
)
