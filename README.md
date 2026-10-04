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
the Double-Clicker, the Cart Shuffler, the Echo, the Bouncer, the Policy Lawyer, the CLI with its
reports and CI, and the console. The Second Opinion is still to come.

## The console

`/app` in the web app is where the runs live: an [AG Studio](https://www.ag-grid.com/studio/)
dashboard over every campaign, finding and ledger entry.

- **Shakedown's own widgets:** the Scoreboard (the Tape), the Cast lineup, the Leak waterfall,
  Finding detail and the Ledger tape, beside AG Studio's grids, charts and filters. Click a leak
  or a customer and the rest of the page follows.
- **Triage**, a custom agent built on AG Studio's Agent Framework. It answers from a summary
  computed in code, and hands everything else to Studio's built-in agents: the Data agent for
  questions, the Lead agent (with Planning, Page and Widget) to build or change widgets.
- **Live runs:** *Run leaky* and *Run sealed* send the four free customers at the local Leaky
  Llama and stream every leak onto the page as PayPal's ledger confirms it.
- **Day shift and Night shift** themes, and a pocket receipt on screens narrower than 720 px.

Every Claude call goes through the same spend gate as the rest of Shakedown, with the console's own
cap (`SHAKEDOWN_CONSOLE_AI_BUDGET_USD`, default $0.25). Measured on Claude Haiku 4.5: a question
Triage answers itself costs about $0.005, one it delegates to the Data agent about $0.03, and
building a chart through Lead, Planning, Page and Widget about $0.19.

## Development

Requirements: Node 22.18 or newer and pnpm 12. The demo store keeps its data in an in-process
Postgres (PGlite); Docker is only needed to try it against a full Postgres.

```bash
pnpm install
cp .env.example .env.local   # then fill in your PayPal sandbox app credentials
pnpm dev                     # web on :3000 (console at /app), demo store on :3100
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

Shakedown is an independent project and is not affiliated with or endorsed by PayPal or AG Grid.

## License

[Apache-2.0](LICENSE)
