# @shakedown-dev/cli

**Customers from hell for your PayPal sandbox checkout. Sandbox only.**

Shakedown sends test customers at your own checkout, webhook listener and support assistant in the
PayPal sandbox. It grades each one from PayPal's ledger, not from what your store says, and prints a
receipt for every dollar that would have leaked, with the fix.

> Always run it as `npx @shakedown-dev/cli`. The bare name `shakedown` on npm belongs to an
> unrelated package, so `npx shakedown` runs someone else's code.

```bash
npx @shakedown-dev/cli preflight --target http://localhost:3000
npx @shakedown-dev/cli run --target http://localhost:3000
npx @shakedown-dev/cli report
```

## The customers

| Name | Tests | Needs |
|---|---|---|
| `double-clicker` | One checkout is charged once, however often Pay is pressed or a capture is retried | PayPal credentials |
| `cart-shuffler` | Goods shipped are never worth more than PayPal captured | PayPal credentials |
| `echo` | Webhooks: unsigned events, duplicates and late events never move goods | — |
| `bouncer` | A declined card never ships anything | PayPal credentials |
| `policy-lawyer` | Your AI support assistant follows your written refund policy | A support route, and your policy as rules (or Claude reads it) |

A run sends the first four by default. They need no AI, so a run costs nothing beyond sandbox calls.
The Policy Lawyer is opt-in (`--cast policy-lawyer`): its lines are scripted, but every one of them is
a message to your support assistant, and that may cost you model calls on your side.

## Setup

Requires Node 22.18 or later. Shakedown reads secrets only from the environment, or from `.env.local`
in the current folder (`--env-file` picks another). It never prints them.

| Variable | What it's for |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Your **sandbox** app. Shakedown reads PayPal's side of each order with them. Without them, the checkout customers are skipped. |
| `SHAKEDOWN_PROBE_SECRET` | 16+ characters, shared with your store's probe route (below). Required. |
| `SHAKEDOWN_VERIFICATION_TOKEN` | For a store that isn't on localhost or a private network: serve it at `/.well-known/shakedown.txt`. |
| `ANTHROPIC_API_KEY` | Optional. Claude is used only by `--explain`, and to read your refund policy when the config doesn't give it. |
| `SHAKEDOWN_AI_BUDGET_USD` | A machine-wide cap on Claude spend (default $1.50). |

`PAYPAL_ENV` must be `sandbox` (the default). Anything else exits with code 3 before a request is sent.

### What your store needs to answer

Shakedown speaks to your store over HTTP, at whatever routes your checkout already has. Let it find
them in your code:

```bash
npx @shakedown-dev/cli discover --write
```

`discover` reads your project's source (Next.js app and pages routers, SvelteKit, Nuxt server routes,
and Express-style routers such as Express, Fastify and Hono). It follows each handler into the
functions it calls, and names the route that creates a PayPal order, the one that captures it, your
webhook listener and your product list. Each comes with the line of code that gave it away. It also
reads how each one talks: the cart's shape, and where PayPal's order ID comes back. `--write` saves
that as `target.routes` in `shakedown.config.ts`, with anything it could not read listed for you to
check. It only reads files on your machine and sends nothing.
[Trailhead Outfitters](https://github.com/PRIEST099/shakedown/tree/main/examples/standard-checkout)
is a store built like PayPal's standard checkout sample, with its discovered config beside it.

What it can't write for you is the probe route. It's one read-only route that tells Shakedown what
your store believes about an order: what it shipped, and what it thinks was captured. Shakedown
reads PayPal's side from PayPal; this route is how it reads yours.

Without a route map, Shakedown expects its own contract, which
[Leaky Llama](https://github.com/PRIEST099/shakedown/tree/main/apps/leaky-llama) speaks:

| Route | For |
|---|---|
| `GET /api/catalog` | The products a customer can buy |
| `POST /api/checkout/orders` | Open a checkout (creates the PayPal order) |
| `POST /api/checkout/orders/:paypalOrderId/capture` | Capture it, as your checkout page would |
| `POST /api/paypal/webhook` | Your webhook listener |
| `GET /api/probe/orders/:id` | **Read-only.** What your store believes about an order. Must refuse any request without the `x-shakedown-probe` header set to `SHAKEDOWN_PROBE_SECRET`. |
| `POST /api/support/chat` | Policy Lawyer only: your support assistant |

## Config

Flags work alone, but a config file keeps a team on the same settings. Shakedown loads the first of
`shakedown.config.{ts,mts,js,mjs,json,yaml,yml}` in the current folder, or the file `--config` names.

```ts
// shakedown.config.ts
import { defineConfig } from '@shakedown-dev/cli'

export default defineConfig({
  target: { url: 'http://localhost:3000' },
  seed: 2026, // the same seed replays the same customers, orders and amounts
  budget: { minutes: 10 },
})
```

`defineConfig` works even when the CLI runs through `npx` without being installed. Install it as a
dev dependency to get types in your editor. YAML works too:

```yaml
# shakedown.config.yaml
target:
  url: http://localhost:3000
cast: [double-clicker, echo]
strict: true
```

| Setting | Default | |
|---|---|---|
| `target.url` | — | Your store: localhost or a private address, or an allow-listed host |
| `target.allowHosts` | `[]` | Public hosts you own; each must serve `SHAKEDOWN_VERIFICATION_TOKEN` |
| `cast` | the four without AI | Who to send |
| `seed` | `2026` | |
| `policy` | — | Your refund policy as rules, for the Policy Lawyer. Without it, Claude reads your store's `/api/policy` |
| `budget.aiUsd` | `0` | Claude spend this run may add. At 0, only replayed answers are used |
| `budget.minutes` | `10` | Stop the campaign after this long |
| `budget.requests` | `200` | Stop after this many requests to your store and PayPal |
| `explain` | `false` | Explain each leak in plain words with Claude |
| `strict` | `false` | Exit 2 when anything was inconclusive or skipped |
| `outDir` | `.shakedown` | |

Unknown settings are an error, and so is anything that looks like a secret.

#### Routes of your own

When your checkout isn't at Shakedown's paths, `target.routes` says where it is and how it talks.
`discover` writes this for you. Leave out anything that matches the defaults.

```ts
target: {
  url: 'http://localhost:8888',
  routes: {
    // Body placeholders: {{lines}}, {{email}}, {{checkoutKey}}, {{total}}, {{totalCents}}, {{currency}}.
    // Each cart line is written with `line`: {{sku}}, {{qty}}, {{unitPrice}}, {{unitCents}}, {{name}}.
    createOrder: {
      path: '/api/orders',
      body: { cart: '{{lines}}' },
      line: { id: '{{sku}}', quantity: '{{qty}}' },
      answer: { paypalOrderId: 'id' }, // dot paths into the JSON answer; `a|b` for either
    },
    // The first :param is the PayPal order ID. A store that hands PayPal's answer back:
    capture: {
      path: '/api/orders/:orderID/capture',
      answer: { status: 'status', captureId: 'purchase_units.0.payments.captures.0.id' },
    },
    webhook: { path: '/webhooks/paypal' },
    catalog: { path: '/api/products', sku: 'id', name: 'title', price: 'price', priceUnit: 'dollars' },
    probe: { path: '/shakedown/orders/:id' },
    support: false, // no support assistant
  },
},
```

A store without a product list sets `catalog: false` and lists what it sells in `target.catalog`
(`[{ sku, name, priceCents }]`). A store that keeps no order number of its own is known by PayPal's
order ID, and so is its probe route. Headers can carry placeholders too (`{ 'Idempotency-Key':
'{{checkoutKey}}' }`), but never secrets: those stay in `.env.local`.

## Commands

**`run`** sends the customers in and writes, to `.shakedown/`:

| File | |
|---|---|
| `report.json` | The versioned report (`shakedown.report/v1`). Everything else is rendered from it. |
| `report.html` | One self-contained page, light and dark |
| `junit.xml` | A leak is a failure; inconclusive and skipped checks are skipped |
| `comment.md` | The pull-request comment |
| `run.json` | The raw ledger, so a fixed grader can judge the run again without re-running it |

Options: `--target`, `--cast double-clicker,echo`, `--seed`, `--budget <usd>`, `--explain`, `--strict`,
`--ci` (no animation), `--out <dir>`, `--config`, `--env-file`.

**`report`** opens the last HTML report, or prints the last run in another format without re-running
it: `--format terminal|markdown|junit|json`.

**`preflight`** checks the environment, the sandbox lock, that the target is allowed and answering, and
that its probe route takes your secret and refuses requests without it.

**`discover [folder]`** finds your checkout's routes in your source code (see above). `--write` saves
them as `shakedown.config.ts`, or as `shakedown.config.discovered.ts` beside a config you already
have. `--target` sets the store's URL in it; otherwise it is guessed from your code.

**`comment`** posts the last run's scoreboard on the pull request in GitHub Actions, and updates that
one comment on later pushes. It uses the workflow's own `GITHUB_TOKEN`.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Pass |
| 1 | Leaks found |
| 2 | Inconclusive (strict mode only) |
| 3 | Safety lock: a non-sandbox PayPal environment, or a target you haven't verified |
| 4 | Config error |
| 5 | Preflight failed: the store isn't answering |

## In CI

```yaml
# .github/workflows/shakedown.yml (start your store first)
permissions:
  contents: read
  pull-requests: write
steps:
  - run: npx @shakedown-dev/cli run --ci
    env:
      PAYPAL_CLIENT_ID: ${{ secrets.PAYPAL_CLIENT_ID }}
      PAYPAL_CLIENT_SECRET: ${{ secrets.PAYPAL_CLIENT_SECRET }}
      SHAKEDOWN_PROBE_SECRET: ${{ secrets.SHAKEDOWN_PROBE_SECRET }}
  - if: always() && github.event_name == 'pull_request'
    run: npx @shakedown-dev/cli comment
    env:
      GITHUB_TOKEN: ${{ github.token }}
```

Shakedown's own repository runs [this workflow](https://github.com/PRIEST099/shakedown/blob/main/.github/workflows/shakedown.yml)
against its demo store on every pull request.

## Responsible use

Shakedown only talks to the PayPal sandbox and refuses live hosts. Point it only at integrations you
own: a public target must prove it's yours by serving your verification token. Shakedown is an
independent project, not affiliated with or endorsed by PayPal.

Apache-2.0
