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

## Run it against your store

```bash
npx @shakedown-dev/cli preflight --target http://localhost:3000
npx @shakedown-dev/cli run --target http://localhost:3000
```

The CLI's [README](packages/cli/README.md) covers the config file, what your store needs to answer,
the reports and CI. Always use the scoped name: `npx shakedown` is someone else's package.

## Status

Under active development for the PayPal AI Hackathon (2026). Built so far: the engine, Leaky Llama,
the Double-Clicker, the Cart Shuffler, the Echo, the Bouncer, the Policy Lawyer, and the CLI with its
reports and CI. The Second Opinion is still to come.

## Development

Requirements: Node 22.18 or newer and pnpm 12. The demo store keeps its data in an in-process
Postgres (PGlite); Docker is only needed to try it against a full Postgres.

```bash
pnpm install
cp .env.example .env.local   # then fill in your PayPal sandbox app credentials
pnpm dev                     # web on :3000 (design preview at /preview), demo store on :3100
pnpm check                   # lint + typecheck
pnpm test
pnpm build
```

Send the four free customers at Leaky Llama as it ships (the store must be running on :3100):

```bash
pnpm shakedown preflight
pnpm shakedown run      # uses shakedown.config.ts at the repo root
pnpm shakedown report   # opens the HTML report
```

Every pull request runs the same thing in CI and posts the scoreboard as a comment
(`.github/workflows/shakedown.yml`). The store's switches live in
`apps/leaky-llama/lib/shipped-mode.ts`: flip one to `sealed` and that leak is fixed.

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | Landing page, docs, the hosted demo and the console |
| `apps/leaky-llama` | Leaky Llama Supply Co., a deliberately leaky demo store (sandbox only) |
| `packages/core` | The engine: the cast, the runner, the ledger, the graders, the HTTP target |
| `packages/paypal` | The PayPal sandbox client and the sandbox lock |
| `packages/tokens` | Design tokens shared by the web app, the console and the video |
| `packages/ui` | Brand components: the Tape receipt, LedgerNumber, Stamp, the imp cast |
| `packages/ai` | Every Claude call, metered and capped, with a replay cache |
| `packages/reporters` | The terminal receipt, JSON, HTML, JUnit and the PR comment |
| `packages/support-bot` | Lulu, Leaky Llama's AI support assistant |
| `packages/cli` | `@shakedown-dev/cli`, the `shakedown` command |

## Responsible use

Shakedown only talks to the PayPal **sandbox** and refuses live hosts. Point it only at integrations you own.
See [SECURITY.md](SECURITY.md).

Shakedown is an independent project and is not affiliated with or endorsed by PayPal.

## License

[Apache-2.0](LICENSE)
