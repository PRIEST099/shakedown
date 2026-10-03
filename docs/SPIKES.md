# Phase 1: sandbox spikes

Before building on a PayPal capability, we prove it works in the sandbox. Each spike is a script in
[`spikes/src`](../spikes/src). Run it with `pnpm --filter @shakedown/spikes s<N>`. Full evidence is
written to `spikes/results/` on the machine that ran it; that folder is kept out of git. IDs below are
shortened sandbox IDs.

Run on **2026-10-02 and 2026-10-03** against a US sandbox business app.

| Spike | What it proves | Result |
|---|---|---|
| **S1** | OAuth client-credentials, token cache, sandbox lock | ✅ Confirmed |
| **S2** | Create and capture a card payment with **no browser** | ✅ Confirmed |
| **S3** | Real webhooks reach a public HTTPS listener and pass `verify-webhook-signature` | ✅ Confirmed (via a temporary Cloudflare quick tunnel) |
| **S4** | Declines, from negative-testing mocks and from real card rejection triggers | ✅ Confirmed |
| **S5** | Partial and full refunds, idempotent replay, the refund cap | ✅ Confirmed |
| **S6** | The dispute simulator: a chargeback on a partly refunded capture | ✅ Confirmed |
| **S7** | Hello-worlds for AG Studio (a), Remotion (b) and Render Workflows (c) | ✅ a, ✅ b, ⏳ c needs a Render account |

## Findings

**S1: auth.**
- The sandbox issued a token, and the client cached and reused it.
- The app holds 21 scopes, including payments, disputes, webhooks and payouts.
- The sandbox lock refused `api-m.paypal.com`.

**S2: headless capture works.**
- `POST /v2/checkout/orders` with `intent: CAPTURE` and a `payment_source.card` (a PayPal published test card, `SCA_WHEN_REQUIRED`) returned **`COMPLETED` at creation**.
- There was no payer-action link, no 3DS, and no separate capture call.
- The capture (`6GH319…1238`, 36.00 USD, PayPal fee 1.42) reads back through `GET /v2/payments/captures/{id}`.
- *Implication:* test customers can pay on their own, so no human has to click through each run.

**S3: webhooks.**
- A webhook registered by API received a **real `PAYMENT.CAPTURE.COMPLETED`**, delivered **42 s** after the payment.
- `verify-webhook-signature` returned `SUCCESS` when it was sent the event's **raw bytes**. We build the request body around the raw body; it is never parsed and re-serialized.
- A copy with one amount changed (`"12.00"` → `"1.00"`) returned `FAILURE`. *Implication (the Echo):* forged or edited notifications are detectable, and stores must verify every event.
- **Correction to our research:** events from the webhook **simulator**, sent to a registered `webhook_id`, are **signed and pass verification**. *Implication:* the Echo can use PayPal's own simulator to send genuinely signed duplicate and out-of-order events. That tests de-duplication and the order state machine, not just signature checks.
- The temporary webhook registration was deleted afterwards and the tunnel was closed.

**S4: declines, plus a real integration trap.**
- `PayPal-Mock-Response: {"mock_application_codes":"INSTRUMENT_DECLINED"}` on capture returns `422 UNPROCESSABLE_ENTITY` with issue `INSTRUMENT_DECLINED`.
- The cardholder-name trigger `CCREJECT-REFUSED` produces a real decline. However, PayPal answers with **order `status: COMPLETED`, while the capture inside it is `DECLINED`** (processor code `0500`).
- *Implication (the Bouncer):* an integration that checks only `order.status` ships goods for a payment that never happened. The fix is to check `purchase_units[].payments.captures[].status === 'COMPLETED'` before fulfilling.

**S5: refunds.**
- A partial refund (18.00 of 45.00) completed.
- **Replaying it with the same `PayPal-Request-Id` returned the same refund**, with no second payout.
- The ledger showed the capture as `PARTIALLY_REFUNDED` and the refund as `COMPLETED`.
- Asking for more than remains returned `422 REFUND_AMOUNT_EXCEEDED`.
- A refund with no amount refunded the remainder, and the capture became `REFUNDED`.
- *Implications:*
  - Per-operation idempotency keys really do protect against the Double-Clicker.
  - The refund cap keeps the "would have leaked" math honest.

**S6: disputes, fully headless.**
- On a 20.00 card capture that already had 10.00 refunded, `POST /v2/customer-support/process-chargeback` returned **201** with a dispute ID (`PP-R-T…0247`).
- `GET /v1/customer/disputes/{id}` immediately showed `OPEN`, stage `CHARGEBACK`, reason `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED`, amount 20.00.
- The request worked without `merchant_id`.
- *Implication (the Second Opinion):* a dispute on an already-refunded order can be created on demand. A store that concedes without checking the 10.00 it already refunded pays twice.

**S7a: AG Studio 3.0.0.**
- `<AgStudio data={{ sources: [...] }} mode="edit" />` renders inside Next 16 / React 19 and picks up our columns.
- It is browser-only, so we load it with `next/dynamic` and `ssr: false`.
- Without a key it logs a license notice and shows a watermark. All features stay unlocked for the trial.

**S7b: Remotion 4.0.532.**
- `@shakedown/ui`'s `<Tape>`, driven by `useCurrentFrame()`, rendered to an MP4 on Node 26 using Remotion's bundled FFmpeg: H.264, 1920×1080, 30 fps, 177 frames.
- The video uses the product's real components.
- To do: load the brand fonts in Remotion (it falls back to a serif). Remotion also warns that our zod 4.6 is newer than its optional zod-types expect; this is harmless because we don't use them.

## Still open

| Spike | What's needed | Fallback |
|---|---|---|
| **S7c** | A Render account for Render Workflows | An in-process job runner behind the same interface (no impact on the gate) |

**Go/no-go (2026-10-03): GO.** The spine (S1, S3, S4 and S5), headless capture (S2) and disputes (S6) are all confirmed in the real sandbox.
