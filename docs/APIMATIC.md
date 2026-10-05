# APIMatic's PayPal Context Plugin

Shakedown calls PayPal's REST API through its own small client (`packages/paypal`), not the PayPal
Server SDK. On October 5, 2026, I checked that client against the SDK's contracts with
[APIMatic's](https://www.apimatic.io) PayPal Context Plugin (`acp-paypal`, from
[apimatic/plugin-marketplace](https://github.com/apimatic/plugin-marketplace)), installed in
Claude Code for this project. Its MCP server answers from the SDK's endpoints, parameters and models.
It led to three fixes and one queued change.

## What I asked, and what it said

| Tool | Query | What came back |
|---|---|---|
| `endpoint_search` | `refundCapturedPayment` | `PayPal-Request-Id`: "The server stores keys for 45 days." `Prefer`: `return=minimal` returns only "the id, status and HATEOAS links"; `return=representation` returns the whole resource. An empty body refunds in full; an `amount` refunds part. 409 means "a previous call for the given resource is in progress". |
| `ask` | How long PayPal keeps a `PayPal-Request-Id` for create order, capture order and refund, and what a retry returns | 6 hours for create and capture; 45 days for refunds. It also said the docs don't state what a retry returns, or whether keys are scoped per merchant. |
| `model_search` | `RefundStatus` | `CANCELLED`, `FAILED`, `PENDING`, `COMPLETED`. |
| `model_search` | `PaymentCollection` | An order's `payments` holds its authorizations, captures and refunds. |

## What changed because of it

1. **Refund idempotency keys were built on the store's own order number** (`refund-<order>-<n>`).
   - With a 45-day key lifetime, that number isn't unique enough. On Render the store started a
     fresh database the same day, numbering orders from 1 again, while sharing the sandbox app
     with every earlier local run. Its refund keys would have repeated ones PayPal may still hold;
     whether that replays the old refund depends on how PayPal scopes keys, which the docs don't
     say.
   - Keys are now built on PayPal's capture ID (`refund-<capture>-<n>`), which no other store or
     database can produce (`apps/leaky-llama/lib/refunds.ts`).
2. **A refund PayPal reports as `FAILED` or `CANCELLED` was booked as done.** It no longer is; the
   support assistant gets the failure instead of telling the customer they're refunded.
3. **Create, capture and refund now send `Prefer: return=representation`** (`packages/paypal/src/api.ts`).
   Shakedown reads the captures and the refund's status from these responses, and the minimal form
   leaves both out. It worked before only because the default happened to be the full form.

All three are covered by tests. Afterwards, the checkout eval (`docs/EVAL-CHECKOUT.md`) was
re-run against the sandbox, and it is unchanged: 8 of 8 leaky cases caught, 0 of 16 sealed cases
flagged.

## Queued

- **Read refunds from the PayPal order itself.** The Policy Lawyer confirms each refund at
  PayPal, but it finds refunds through the IDs the store reports. Since an order's `payments` lists
  every refund, the grader should read them there, so a refund the store never recorded can't
  slip past.
- **A fresh capture key after a decline.** Sealed captures send one key per PayPal order
  (`capture-<order>`), and PayPal keeps capture keys for 6 hours. A customer who is declined and
  retries on the same order could get the old decline back. Each attempt should get its own key,
  while a double submit of the same attempt still shares one.

## How it went

- **What worked:** precise answers in seconds, straight from the SDK's contract: key lifetimes,
  status values, the `Prefer` forms, error codes per endpoint. Several were details I had only
  seen in my own sandbox spikes, and one, the 45-day refund-key lifetime, turned a quiet bug
  into a real one.
- **What didn't:**
  - The plugin's bundled agents couldn't reach its MCP tools in my setup, so I queried the tools
    directly.
  - `ask` couldn't say what a retry with the same key returns.
  - The SDK has no webhook endpoints, so `verify-webhook-signature` had nothing to be checked
    against. There I still rely on my own sandbox spike (`docs/SPIKES.md`, S3).
