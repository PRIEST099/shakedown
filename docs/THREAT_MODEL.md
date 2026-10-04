# Threat model

Shakedown sends test customers at a checkout. This page lists what could go wrong with that, in the
CLI and in the hosted demo, and the code that stops each one. It was last reviewed on 2026-10-04,
at the end of Phase 11.

## What is worth protecting

- **The operator's PayPal sandbox app:** its credentials, and its API quota.
- **The probe secret.** It opens the store's read-only probe API and signs campaign tokens.
- **The Anthropic key, and the money behind it.** The account holding it has $5.
- **The Render API key.** It can start workflow runs, and more: see "Hosting" below.
- **The demo's availability during judging.**
- **Other people's integrations.** Shakedown must never be pointed at them.

## Trust boundaries

1. **The operator's machine and the CLI.** Configuration is code the operator wrote. Secrets come
   from the environment.
2. **The visitor's browser and the hosted site and console.** Everything a browser sends is
   untrusted.
3. **The hosted services and each other.** The web app, the Workflows service and the demo store
   talk over Render's private network. The store believes a caller only when it holds the probe
   secret or a campaign token signed with it.
4. **Shakedown and PayPal.** Only the sandbox API is reachable.
5. **Shakedown and Claude.** Every call passes the spend gate.

## Threats and what stops them

| Threat | What stops it | Where |
|---|---|---|
| Pointed at someone else's integration | A target must be local or on a private network, or allow-listed and serving the owner's verification token, before the first request. The hosted runner reads its store address from its own environment: a job carries none. | `packages/core/src/guards.ts`, `packages/runs/src/customer.ts` |
| Real money moves | The sandbox lock refuses every PayPal host but the sandbox API, and `PAYPAL_ENV` must be `sandbox`. | `packages/paypal/src/sandbox-lock.ts`, `packages/core/src/env.ts` |
| A secret leaks into a file, log or report | Secrets are read from the environment only. A config key that looks like a secret is rejected. Known secrets are redacted from every message. The Blueprints commit none, the recorded runs hold none, and the ledger never records headers. All four are tested. | `packages/cli/src/config.ts`, `packages/core/src/redact.ts`, `apps/workflows/src/blueprint.test.ts` |
| Someone runs up the Claude bill | Every call passes a gate that checks the worst case against what's left, before anything is sent. The model is pinned server-side, every reply has a token ceiling, and each visitor's turns are limited. Hosted caps survive deploys: Triage's lives in Postgres, Lulu's on the store's disk. | `packages/ai/src/gate.ts`, `apps/web/lib/console/spend.ts` |
| Someone exhausts the sandbox app's quota or the demo's capacity | Hosted runs are limited per visitor, to three at once, and to 200 a day. Checkouts, test deliveries and chat are limited per visitor, with a ceiling for checkouts. Captures are limited per order. Open live streams are capped. Request bodies are capped. | `packages/runs/src/runners.ts`, `apps/leaky-llama/lib/rate-limit.ts` |
| A visitor forges their address to dodge a limit | On Render, limits key on `CF-Connecting-IP`, which Cloudflare overwrites, never on `X-Forwarded-For`. | `apps/web/lib/console/guard.ts`, `apps/leaky-llama/lib/rate-limit.ts` |
| Another site drives the console (CSRF) | Console actions need a custom header, which a cross-site page can't send without a CORS preflight this app never answers. The store's cookies are `SameSite=Lax`. | `apps/web/lib/console/guard.ts` |
| One run changes another's results | A campaign token (HMAC-SHA256, expiring) sets the store's switches for that campaign only. Each order keeps the switches it was placed under. | `packages/core/src/campaign-token.ts` |
| Someone reads the store's probe API | The probe needs the shared secret, compared in constant time, and it only reads. | `apps/leaky-llama/lib/probe.ts` |
| Someone reads another customer's order through Lulu | Lulu's tools need the order number and the email on it, and give the same answer when either is wrong. | `apps/leaky-llama/lib/support.ts` |
| An error message reveals the private network | A failed run's reason is a plain sentence. The detail goes to the server log and the job row. | `packages/runs/src/campaign.ts` |
| Script or HTML injection | React escapes everything, and nothing renders raw HTML. The HTML report and the PR comment escape their own output, and tests cover it. | `packages/reporters/src/html.ts`, `packages/reporters/src/markdown.ts` |
| Clickjacking, sniffing, plugins | Every page is sent with these headers: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `object-src 'none'`, `base-uri 'self'`, a strict referrer policy, and unused browser features switched off. On Render they also carry HSTS. | `apps/web/next.config.ts`, `apps/leaky-llama/next.config.ts` |
| Someone reaches the database | Render's Postgres accepts no outside connections (`ipAllowList: []`). Only the services on the private network reach it. | `render.yaml` |
| A poisoned package | pnpm 12's supply-chain checks run on every install. The lockfile is frozen in CI and on Render. GitHub Actions are pinned by commit. | `pnpm-workspace.yaml`, `.github/workflows/` |

## Hosting

**The Render API key** reaches every workspace its owner belongs to.
- Create it from a Render user that belongs only to the Shakedown workspace.
- Set it on the web service only.
- Rotate it after judging.

**Accepted risks.** These come with the demo, and they cost no real money:
- **Fake webhooks.** Anyone can send the hosted store a webhook that its leaky switches act on,
  and that changes demo data.
- **Refunds by capture ID.** In the leaky wiring, Lulu can refund a sandbox capture someone names.
  That is the Policy Lawyer's whole point, and it happens in the sandbox.

**Indirect prompt injection.** Triage reads demo data that includes customers' messages, and
someone could plant an instruction in one. Its tools only read the console's own tables and
change the visitor's own page. No secret, payment or other visitor is reachable from it.

## Dependency audit (2026-10-04)

`pnpm audit` reports 13 advisories: 0 critical, 5 high, 5 moderate and 3 low. None is reachable
from how Shakedown runs:

- **11 come in through `@paypal/agent-toolkit` 1.11.0, the latest release.** It pins `ai` 4,
  `@langchain/core` 0.3.6, LangSmith, mathjs, jsondiffpatch and uuid. Shakedown uses the toolkit
  only in the demo store, for Lulu's leaky wiring, and loads only its `ai-sdk` entry point.
  - That entry point never loads LangChain or LangSmith.
  - It calls nothing from mathjs but `round`; the mathjs advisories concern its expression parser.
  - The AI SDK's file-upload and UI-streaming paths, where the `ai` and jsondiffpatch advisories
    live, are never used: Lulu talks to Claude through Anthropic's own SDK.
- **2 are in esbuild,** inside `drizzle-kit` and `tsup`. Both affect esbuild's development
  server, which Shakedown never runs.

The engine, the CLI and the web app don't depend on the toolkit at all. Re-run `pnpm audit` before
each release.
