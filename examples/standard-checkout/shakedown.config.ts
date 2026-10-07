/**
 * Written by `npx @shakedown-dev/cli discover` on 2026-10-07, from this project's source code.
 * Routes are read from the code; request and answer shapes are guesses from how the code reads
 * them. Then run `npx @shakedown-dev/cli preflight`.
 */
import { defineConfig } from '@shakedown-dev/cli'

export default defineConfig({
  target: {
    url: 'http://localhost:8888',
    routes: {
      createOrder: {
        method: 'POST',
        path: '/api/orders',
        body: {
          cart: '{{lines}}',
        },
        line: {
          id: '{{sku}}',
          quantity: '{{qty}}',
          price: '{{unitPrice}}',
        },
        answer: {
          paypalOrderId: 'id',
        },
      },
      capture: {
        method: 'POST',
        path: '/api/orders/:orderID/capture',
        answer: {
          status: 'status',
          captureId: 'purchase_units.0.payments.captures.0.id',
        },
      },
      webhook: {
        method: 'POST',
        path: '/webhooks/paypal',
      },
      catalog: {
        method: 'GET',
        path: '/api/products',
        items: '',
        sku: 'id',
        name: 'title',
        price: 'price',
        priceUnit: 'dollars',
      },
      probe: {
        method: 'GET',
        path: '/shakedown/orders/:id',
      },
      support: false,
    },
  },
})
