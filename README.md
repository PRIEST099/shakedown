# Shakedown

**Customers from hell. Sandbox only.**

Shakedown is a pre-launch test drive for PayPal checkouts and AI support agents. Six sandbox-only test
customers run against your *own* integration in the PayPal sandbox. Shakedown then prints a receipt for
every dollar that would have leaked, read from PayPal's sandbox ledger, plus the fix. It can also run in CI,
so a leak can't quietly come back.

> A *shakedown cruise* is a ship's test voyage before it enters service. This one is for your checkout.

## The cast

| # | Customer | What it tests |
|---|---|---|
| 01 | The Double-Clicker | Idempotency: one order, one capture |
| 02 | The Cart Shuffler | Amount integrity before fulfillment |
| 03 | The Echo | Webhook signature verification and de-duplication |
| 04 | The Bouncer | Graceful handling of declined payments |
| 05 | The Policy Lawyer | Your AI support agent follows your written refund policy |
| 06 | The Second Opinion | Dispute handling reconciles earlier refunds |

The AI plays the customers and explains what it finds. Deterministic code reads the PayPal sandbox ledger
and decides whether money leaked. The AI never makes that call.

## Status

Under active development for the PayPal AI Hackathon (2026). This is **Phase 0**: the foundations and a
design preview.

## Development

Requirements: Node 22.12 or newer, pnpm 12, and Docker (for Postgres).

```bash
pnpm install
cp .env.example .env.local   # then fill in your PayPal sandbox app credentials
pnpm dev                     # web on :3000 (design preview at /preview), demo store on :3100
pnpm check                   # lint + typecheck
pnpm test
pnpm build
```

Check your setup and the sandbox lock:

```bash
pnpm --filter @shakedown-dev/cli build && node packages/cli/dist/index.js preflight
```

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | Landing page, docs, the hosted demo and the console |
| `apps/leaky-llama` | Leaky Llama Supply Co., a deliberately leaky demo store (sandbox only) |
| `packages/core` | Cast, env validation, redaction; the engine lands here in Phase 2 |
| `packages/paypal` | The PayPal sandbox client and the sandbox lock |
| `packages/tokens` | Design tokens shared by the web app, the console and the video |
| `packages/ui` | Brand components: the Tape receipt, LedgerNumber, Stamp, the imp cast |
| `packages/cli` | `@shakedown-dev/cli`, the `shakedown` command |

## Responsible use

Shakedown only talks to the PayPal **sandbox** and refuses live hosts. Point it only at integrations you own.
See [SECURITY.md](SECURITY.md).

Shakedown is an independent project and is not affiliated with or endorsed by PayPal.

## License

[Apache-2.0](LICENSE)
