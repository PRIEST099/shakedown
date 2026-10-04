# @shakedown/workflows

Shakedown's [Render Workflows](https://render.com/docs/workflows) service. It runs a hosted
campaign as two tasks:

- **`campaign`**: one run per campaign. It chains a `customer` run for each customer, in order,
  then grades the whole ledger and stores the campaign.
- **`customer`**: one customer's visit to the demo store, on its own compute, retried once if
  it fails. A retry replays the same random draws with a fresh nonce, so the store never mistakes
  it for the first attempt.

Each customer picks up the random streams where the previous one left them, so a hosted run is
the same run the CLI makes with the same seed. Progress goes to the console's Postgres as it
happens, and the web app streams it to the page.

The logic lives in `@shakedown/runs`. The web app uses the same code to run campaigns in-process
when no workflow service is configured. This package only registers the tasks.

```bash
pnpm --filter @shakedown/workflows build   # bundles to dist/index.js
pnpm --filter @shakedown/workflows test    # includes the Render Blueprint checks
```

**Environment:**
- `CONSOLE_DATABASE_URL`;
- `SHAKEDOWN_PROBE_SECRET`;
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (sandbox);
- `LEAKY_LLAMA_HOSTPORT` (or `LEAKY_LLAMA_URL`).

`render.yaml` sets all of them. The service only ever tests the demo store it was deployed with:
a job carries no address. See [docs/DEPLOY.md](../../docs/DEPLOY.md).
