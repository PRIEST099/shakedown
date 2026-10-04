# Changelog

## Unreleased

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
