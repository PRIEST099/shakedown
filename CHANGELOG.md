# Changelog

## Unreleased

### @shakedown-dev/cli 0.2.3: tried on 16 more stores, in other setups (2026-10-08)

- **Tried on:** PayPal's standard checkout sample with its Python (Flask) backend, and a public
  NestJS + Next.js project. Live in the sandbox:
  - **Python:** one leak, the double click charging the customer twice ($100), as with PayPal's
    Node backend.
  - **NestJS:** two leaks. The double click charged the customer twice, and the store charged
    €1.00 for a €100 booking because it takes its price from the browser. (The receipt still
    prints every amount in dollars; it should use the capture's currency.)
- **Fixed: a TypeScript or JavaScript config didn't load in a CommonJS folder.** That's the
  `package.json` `npm init` writes, and what a Python or PHP store ends up with. The config now
  loads as a module wherever it is.
- **The price check works without a probe route.** When PayPal captured less than the cart's
  catalog price, that's a leak, judged from PayPal's records and the catalog. Before, it was
  inconclusive.
- **Fixed: preflight failed a NestJS store** that has no probe route, since NestJS answers unknown
  routes with a JSON 404. Only a probe's own answer, with `found`, counts as a probe route now.
- **Capture by body:** `{{paypalOrderId}}` puts PayPal's order ID in a capture route's body, for
  stores that take `{ orderId }` instead of a path parameter.
- **Then tried on 14 more public projects** (Express, Next.js, SvelteKit, Hono, Fastify, a
  Turborepo monorepo, Laravel, and PayPal's own v6 SDK sample and Next.js guide). Live in the
  sandbox:
  - **PayPal's v6 SDK sample:** one leak, the double click charging the customer twice ($15). It
    sends a `PayPal-Request-Id`, but a new random one on every request, so PayPal can't tell the
    second submit is a repeat.
  - **An Express tutorial that captures on PayPal's redirect back** (`GET /execute-payment?token=`):
    one leak, the same double charge ($115).
- **Fixed: preflight counted products the run couldn't use.** It said "4 products" for a list
  whose entries lacked the field the config names, and the run then found nothing to sell. Preflight
  now reads the list the way the run does, and fails with the field to set.
- **discover, from those projects:**
  - follows a product route into the constants it lists (`getAllProducts()` → `PRODUCT_CATALOG`), so
    it names the right fields;
  - reads Hono routes chained on `new Hono()`, mounted with `.route()`, and typed parameters
    (`/:id{[0-9]+}`);
  - finds a capture on PayPal's redirect back, with the order in the query (`?token=:token`), and
    one whose URL ends in the order's own intent;
  - reads a route that names its handler (`router.post('/orders', createOrder)`) for its answer,
    and an answer that wraps PayPal's (`res.json({ data: response.body })`);
  - accepts the camelCase capture ID that PayPal's server SDK returns (`purchaseUnits`);
  - reads the port from `PORT ? Number(PORT) : 8080`;
  - flags an idempotency key made fresh on every request;
  - no longer takes a store's own `ordersController.createOrder`, or another provider's webhook
    (Stripe, BenefitPay, Tiltify), for PayPal's; the paid-on-the-browser's-word hint leaves other
    providers' routes and admin routes alone;
  - says when a checkout runs on Next.js Server Actions (no URL to test), and when a project has no
    PayPal code at all.
- **discover, from the first two:**
  - reads NestJS `@Body('amount')` and `@Body() dto`, and a service that returns PayPal's answer;
  - reads how a page calls a route whose URL starts with a variable (`${API_URL}/paypal/...`);
  - fills in a capture route's body when the order travels there;
  - flags an order priced from the request;
  - says when a store's PayPal code is in a language it doesn't read, instead of asking whether
    this is the right folder.

### @shakedown-dev/cli 0.2.2 (2026-10-07)

- **Search keywords on npm** (paypal, paypal-sandbox, checkout, payments, webhooks, testing, and more), so searches like "paypal checkout testing" can find the package. No code changes.

### @shakedown-dev/cli 0.2.1: what checking the published 0.2.0 found (2026-10-07)

- **Checked with npx:** the published 0.2.0 was run with `npx` against nine codebases and two live
  sandbox stores, and every result matched. A fresh-eyes check of the npm page found the rest.
- **Fixed: `run --explain`, and the Policy Lawyer without a written policy, crashed.** The Claude SDK
  needs `zod` as a peer, and the package never installed it. It's now a dependency. (0.1.x had the
  same fault.)
- **Fixed: a run that judged nothing said SEALED.** With nothing leaked and nothing held:
  - the receipt, the HTML report and the pull-request comment now say INCONCLUSIVE;
  - the comment no longer marks such a customer "Sealed", and lists why each check couldn't be
    judged.
- **Fixed: a store that isn't running stopped nothing** when the config lists the products: `run`
  went on, judged nothing and exited 0. It now checks the store answers first, and exits 5.
- **discover** counts a POST route at a PayPal webhook path (`/webhooks/paypal`) as the listener
  even when its handler shows nothing more. It no longer says "Shakedown's own body" for a body it
  couldn't read.
- **preflight checks for `SHAKEDOWN_PROBE_SECRET`** with or without a target, so it can't say
  "Ready" before a run that would fail. Its probe check uses the route's own `method`.
- **Docs:**
  - The help puts `--target` with preflight and discover too, and says where `--write` saves.
  - The README covers `target.routes`, `target.catalog` and `switches` in the settings table,
    every exit code (including discover's), route `method` and `catalog.items`, and preflight's
    probe warning.

### Discover: Shakedown at any store's routes (2026-10-07)

- **Route maps.** `target.routes` in the config says where a store's checkout lives and how it talks:
  each route's method and path, the JSON body to send (a template with `{{placeholders}}`), and
  where the fields Shakedown needs are in the answer (dot paths). Anything left out is Shakedown's
  own contract, so Leaky Llama and existing configs work as before. `target.catalog` lists the
  products for a store that has no product list route.
- **`npx @shakedown-dev/cli discover`** reads a store's source code and writes that map. It finds
  routes in Next.js (app and pages routers), SvelteKit, Nuxt and Express-style routers, mount
  prefixes included. It follows each handler two calls deep and scores it for each role by the PayPal
  calls and event names only that job touches. It reads the cart's shape and where PayPal's order ID
  comes back, and prints each finding with the line of code behind it. It reads files only and
  sends nothing.
- **Tried on seven public projects with PayPal checkouts:**
  - **PayPal's official sample, PayPal's dev-team Express example, and a Cloudflare Worker:** their
    create and capture routes were found, with the cart's shape and where PayPal's order ID comes
    back.
  - **Two open-source shops:** discover flags the route that marks an order paid on the browser's
    word, which no request to PayPal ever confirms.
  - **One uses PayPal's v1 API,** which it names as out of reach.
  - **One is a framework plugin with no HTTP routes.**
  - **This added:** Workers and plain Node servers that route by hand, `router.route()` chains,
    handlers wrapped in helpers, NestJS controllers, TypeScript return types, reading the cart's
    shape from the store's own pages, and comments no longer counted as code.
- **Worth checking:** discover now flags four patterns, each with the lines behind it:
  - a payment the browser confirms;
  - no idempotency key;
  - an unverified webhook listener;
  - the v1 API.

  With no webhook listener, the config it writes leaves the Echo out.
- **@shakedown-dev/cli 0.2.0.**
- **A second demo store, Trailhead Outfitters** (`examples/standard-checkout`): built like PayPal's
  standard checkout sample, with no dependencies. `discover` found all its routes. A sandbox run
  against it found its six deliberate leaks and passed the two checks it gets right.

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
