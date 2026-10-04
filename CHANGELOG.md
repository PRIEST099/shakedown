# Changelog

## Unreleased

### Phase 9: the site and docs (2026-10-04)

- The landing page at `/`, per DESIGN_SPEC.md: hero, problem, the cast, how it works, the live
  demo, CLI and CI, "AI decides vs code decides", responsible use, the judges' tour and the footer.
- The hero receipt replays a recorded sandbox run and seals it to $0.00 in under five seconds.
  Every ID and amount comes from the recorded runs, checked by a unit test and an end-to-end test.
  With reduced motion it shows the before and after receipts, still.
- The live demo sends the four free customers at the local Leaky Llama and prints each leak as
  PayPal's ledger confirms it, then "Apply fixes and re-run". The cast cards show each result.
- `/docs`: quick start, what your store answers, config, CI, the console, how it decides, and how
  each responsible-use rule is enforced. `RESPONSIBLE_USE.md` at the repository root.
- A favicon and touch icon from the logo mark, and a share image that is a screenshot of the
  real receipt components (`/og-card`).
- The display face is one instance of Bricolage Grotesque (weight 800, optical size 96, width
  75–100): 40 KB instead of 131 KB. Lighthouse mobile: performance 96, accessibility 100.
- `/console` and `/demo` redirect to `/app`, and `/judges` to the tour. The `/preview` and
  `/spikes` pages, which showed placeholder data, are gone.
- `pnpm --filter @shakedown/web e2e`: the site's own end-to-end checks.

### Phase 8: the console (2026-10-04)

- `/app`: an AG Studio 3 console over Shakedown's campaign store (PGlite locally, Postgres when
  hosted), seeded with four real recorded sandbox runs.
- Five custom widgets: the Scoreboard, the Cast lineup, the Leak waterfall, Finding detail and the
  Ledger tape, with cross-filtering, alongside AG Studio's own grids, charts and filters on three
  pages. Day shift and Night shift themes; a pocket receipt on phones.
- Triage, a custom agent on AG Studio's Agent Framework: a code-computed leak summary of its own,
  and delegation to the built-in Data, Lead and Widget agents. Claude reaches the page through a
  server route, so no key is ever in the browser, and through the spend gate with a console cap.
- Live runs from the console, streamed over Server-Sent Events and stored when they finish.
- The campaign store keys findings by campaign, and records each run's source, switches and
  skipped scenarios (migration `0001`).

### Phase 7: CLI, reports and CI (2026-10-04)

- `@shakedown-dev/cli` 0.1.0: `run`, `report`, `preflight` and `comment`, with a typed
  `shakedown.config.ts` (or `.json` / `.yaml`) and the documented exit codes.
- `run` sends the four customers that need no AI by default. Claude is opt-in, with a spend budget per
  run (`--budget`) on top of the machine-wide cap.
- Reports from one versioned JSON file (`shakedown.report/v1`): the animated terminal receipt, a
  single-file HTML page, JUnit XML and a Markdown pull-request comment.
- `preflight` now checks the target too: allowed, answering, and a probe route that takes the
  secret and refuses requests without it.
- Shakedown's own CI runs the CLI against Leaky Llama as it ships and keeps one scoreboard comment
  per pull request up to date. Leaky Llama's default switches moved to `lib/shipped-mode.ts`.

### Phases 2 to 5 (2026-10-02 to 2026-10-04)

- The engine (seeded, budgeted, graded from PayPal's ledger), Leaky Llama with a real sandbox
  checkout, the Double-Clicker, the Cart Shuffler, the Echo, the Bouncer, the Policy Lawyer and Lulu.

### Phase 0: foundations (2026-10-02)

- pnpm + Turborepo monorepo with Biome, Vitest and a CI workflow.
- `@shakedown/core`: the six-persona cast, validated env loading (sandbox only), secret redaction.
- `@shakedown/paypal`: the sandbox lock, which refuses any non-sandbox PayPal host.
- `@shakedown/tokens` and `@shakedown/ui`: the "Returns Desk" design system, with the Tape receipt,
  LedgerNumber, the SEALED stamp, and the imp rig with six costumes.
- `apps/web`: placeholder landing page and the `/preview` design preview.
- `apps/leaky-llama`: placeholder for the demo store.
- `@shakedown-dev/cli`: `shakedown preflight`.
