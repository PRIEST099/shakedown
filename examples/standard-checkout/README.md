# Trailhead Outfitters

A second demo store, built the way most PayPal integrations start: in the shape of PayPal's standard
checkout sample. It's here to show that Shakedown works at a store's own routes, not only at its own
contract. **PayPal sandbox only.** It's one file, with no dependencies.

| Route | What it does |
|---|---|
| `GET /api/products` | The products, prices in dollars |
| `POST /api/orders` | Opens a PayPal order for `{ cart: [{ id, quantity, price? }] }` and answers with PayPal's order |
| `POST /api/orders/:orderID/capture` | Captures it, ships, and hands PayPal's answer straight back |
| `POST /webhooks/paypal` | The webhook listener |
| `GET /shakedown/orders/:id` | Shakedown's read-only probe route: what the store believes about an order |

Like Leaky Llama, it keeps some classic mistakes on purpose (marked `LEAK` in `server.mjs`):
- it trusts a price the browser sends;
- it has no idempotency key;
- it believes the order's status rather than the capture's;
- its webhook listener never verifies a signature and acts on every copy of an event.

It gets two things right: a retried capture doesn't ship twice, and it ships what was ordered rather
than a cart swapped in at capture.

## Try it

```bash
node --env-file=../../.env.local server.mjs        # http://localhost:8888
npx @shakedown-dev/cli discover --write             # finds the routes above, writes shakedown.config.ts
npx @shakedown-dev/cli preflight --env-file ../../.env.local
npx @shakedown-dev/cli run --env-file ../../.env.local
```

The `shakedown.config.ts` here is the one `discover` wrote, unedited. A sandbox run with it found:
- the six leaks: the double submit, the browser's own price tag, three unsigned "paid" messages, and
  the declined card that ships;
- the two checks it passes: the retried capture and the swapped cart.
