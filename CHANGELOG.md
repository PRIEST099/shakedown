# Changelog

## Unreleased

### Phase 12: the video, first cut (2026-10-05)

- **An animatic of the hackathon video** (`apps/video`, 2:40), in Remotion, from real footage:
  - Playwright records the site and the console frame by frame, logging the cursor, the clicks,
    and a mark for every receipt line as it prints, all on one clock.
  - The cut is worked out from those marks: footage at real speed for the clicks and ramped up
    while the receipt prints, each segment tagged with its speed; the camera eases in on what
    matters; and beside the receipt, an ink panel says each leak in plain words as it prints.
  - The voiceover is scripted in `src/script.ts`. Until it's recorded, the animatic shows it as
    captions, at most two lines of about 42 characters.
- **A 40-second vertical teaser** that loops, and **a 4K thumbnail**.
- **A scratch voiceover,** read by Kokoro-82M (Apache-2.0), run locally: one take per sentence,
  with the cut timed from each take's real length and the music ducked 10 dB under it.
  `VOICEOVER.md` is the script for recording your own voice in its place.
- **An original score, composed in code** from oscillators and seeded noise (no samples). Its LEAK
  and SEALED sounds land on the frames where the receipt prints and seals.
- **Mastering to the platform level:** −14 LUFS, true peak under −1.5 dBTP, with a BS.1770-4 meter
  and a true-peak limiter written for it, since Remotion's ffmpeg has no limiter.
- **An asset ledger** (`apps/video/ASSETS.md`): the four OFL fonts, with the attributions from their
  name tables, and everything made for the project.
- **Fixed: shared components lost their fonts outside the site.** `tokens.css` builds the font
  stacks from variables that only exist inside the page, so the video now sets the stacks too.

### Phase 11: hardening, evals and credibility (2026-10-05)

- **Security review.** The new [threat model](docs/THREAT_MODEL.md) ties each threat to the code
  that stops it. Fixes:
  - **The public demo store is now limited:** checkouts (per visitor and overall), test webhook
    deliveries, and Lulu per address, all in judge mode.
  - **The client address comes from `CF-Connecting-IP` on Render.**
  - **Both apps send security headers:** framing, sniffing, plugins, referrer and permissions,
    plus HSTS on Render.
  - **Open live streams are capped.**
- **Dependency audit.** It found 13 advisories, none reachable from how Shakedown runs. The
  reachability analysis is in the threat model.
- **Accessibility.** axe checks every page of the site, in both themes, and every page of the
  store. They found and fixed four problems:
  - an outline button with too little contrast in Night shift;
  - a scrollable region keyboard users couldn't reach;
  - a focus ring removed by a style reset;
  - tabs missing Home and End.
- **Performance.** The console no longer loads AG Studio on phones (mobile performance went from
  75 to 95), and no longer shifts while Studio lays out (desktop CLS went from 0.158 to 0.002).
- **Error pages.** Both apps have their own 404 and error pages.
- **A new eval.** `pnpm eval:checkout` runs the checkout cast against each store switch on its
  own, in the sandbox. Every customer caught its own leak in all 8 cases, with no false alarm in
  16 ([EVAL-CHECKOUT.md](docs/EVAL-CHECKOUT.md)). The Policy Lawyer eval replays unchanged, at $0.
- **README additions:** "For judges (2 minutes)", an architecture diagram, and "Tools used". There
  is also a Postman collection of the demo's API.

### Phase 10: hosting on Render (2026-10-04)

- `render.yaml` deploys the demo to Render:
  - the site and console;
  - Leaky Llama, with a persistent disk;
  - a Render Workflows service;
  - Postgres, reachable only on Render's private network.

  `render.judge.yaml` is the frozen copy for judging. Both are checked against Render's schema
  and against each other.
- Hosted runs are jobs (`@shakedown/runs`, migration `0002`). A run goes to Render Workflows when
  it's configured, and otherwise runs in the web app.
  - The `campaign` task runs each customer as its own `customer` task, retried on its own, and
    hands the random streams on. A hosted run is the same run as the CLI's with the same seed.
  - Progress goes to a Postgres event log, which the page streams from.
- The engine can resume another run's random streams (`resume`, `streams`), so a campaign can run
  one customer at a time and still draw exactly what one run of the whole cast would.
- Judge mode (`SHAKEDOWN_JUDGE_MODE=1`):
  - per-visitor limits, keyed on the address Cloudflare writes on Render;
  - up to three runs at once, and 200 a day;
  - Triage's spend kept in Postgres, so its cap survives deploys.
- When PayPal's sandbox or the store isn't answering, `/api/console/status` says why. The site
  then shows a labelled recording of a real run, and the console pauses its live runs.
- `PayPalApiError` is recognised even when its module was loaded twice. A stale dev server had
  turned PayPal's "already captured" into an unknown error and a false "sealed".
- Visitors never see internal addresses or raw errors in a failed run's reason.

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
