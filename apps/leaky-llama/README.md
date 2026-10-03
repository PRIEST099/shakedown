# Leaky Llama Supply Co.

A demo store written with common PayPal integration mistakes, so Shakedown has something real to
test. It runs **only against the PayPal sandbox**. Every mistake has a switch, and every switch
has a sealed position that is the documented fix.

```bash
pnpm --filter @shakedown/leaky-llama dev   # http://localhost:3100
```

It shares the repo-root `.env.local` (sandbox `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`). The
store's database is PGlite, an in-process Postgres under `.data/pglite`, so it needs no Docker.
Set `STORE_DATABASE_URL` to use a real Postgres instead.

## The six switches

One per property the cast tests. Open **Leak switches** in the dark strip at the top of any page.

| Switch | Leaky (how integrations often ship) | Sealed (the fix) | Code |
|---|---|---|---|
| Double-Clicker · idempotency | A new PayPal order per submit; "already captured" is treated as a fresh success and ships again | One key per checkout, one `PayPal-Request-Id` per create and capture, fulfilment claimed once by the database | `lib/checkout.ts`, `lib/fulfillment.ts` |
| Cart Shuffler · amount integrity | Trusts prices the browser sends; ships whatever the cart says at capture time | Prices from the catalog; ships the order as priced, only when captured amount and currency match | `lib/catalog.ts`, `lib/checkout.ts` |
| The Echo · webhook integrity | Acts on any delivery: unverified, repeated or out of order | `verify-webhook-signature` on the raw bytes (fails closed without `PAYPAL_WEBHOOK_ID`), each event ID once, older events ignored | `lib/webhooks.ts` |
| Bouncer · decline handling | Believes the order status | Believes the capture status: a declined card can leave the order `COMPLETED` with the capture `DECLINED` | `lib/checkout.ts` |
| Policy Lawyer · agent policy adherence | Lulu holds PayPal's agent-toolkit `create_refund` tool directly; the policy lives only in the prompt | Lulu can only ask the store, which applies the written policy in code | `packages/support-bot`, `lib/support.ts`, `lib/policy.ts` |
| Second Opinion · dispute reconciliation | A dispute is recorded and nothing is checked | Held for review, with captured, refunded and disputed sums worked out | `lib/webhooks.ts` |

Every order keeps the switches it was placed under, so later notifications about it behave the
same way, whoever flips the panel in the meantime.

**Which switches apply to a request**, in order:

1. A signed campaign token in `x-shakedown-campaign`, minted by Shakedown with the shared
   `SHAKEDOWN_PROBE_SECRET`. This keeps concurrent campaigns apart.
2. The visitor's `ll_mode` cookie, set by the toggle panel.
3. Otherwise, every switch is leaky.

## What Shakedown reads

`GET /api/catalog` is public, like any storefront: what the store sells, at its own prices. The
cast picks what to buy from it. Everything else here is read-only and protected by
`x-shakedown-probe: <SHAKEDOWN_PROBE_SECRET>`.

- `GET /api/probe/orders/:id`: what the store believes about an order (`LL-10042` or the PayPal
  order ID). Status, amounts, every shipment with the code path that released it, refunds,
  disputes, and each webhook delivery with what the store did about it.
- `GET /api/probe/orders/:id/deliveries`: those deliveries byte for byte, with their
  transmission headers.
- `GET /.well-known/shakedown.txt`: serves `SHAKEDOWN_VERIFICATION_TOKEN`, so Shakedown can
  confirm whoever runs it also runs the store.

## Lulu

The support assistant on `/support`, built on Claude with the official Anthropic SDK. It needs
`ANTHROPIC_API_KEY`; without one the store works and the Help page says Lulu isn't connected.
`LULU_MODEL` defaults to `claude-opus-5` (`claude-haiku-4-5` is cheaper per turn) and
`LULU_EFFORT` to `medium`. Chat is rate-limited per visitor, because tokens cost real money even
though refunds are sandbox.

## Checking it

```bash
pnpm --filter @shakedown/leaky-llama test                          # unit + integration, on PGlite
RUN_SANDBOX_TESTS=1 pnpm --filter @shakedown/leaky-llama exec vitest run lib/sandbox.test.ts
pnpm --filter @shakedown/leaky-llama e2e                           # Playwright, in your installed Chrome
```

The end-to-end suite builds the store and serves it on port 3101 with its own fresh database,
then buys a bottle with PayPal's published sandbox test card. In the card form, the name
`CCREJECT-REFUSED` makes the sandbox decline the card, which is how to see the Bouncer by hand.
