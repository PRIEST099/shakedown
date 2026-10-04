# Deploying Shakedown on Render

Two Blueprints describe the hosted demo:

- **`render.yaml`**: the dev environment. It deploys from `main` on every push.
- **`render.judge.yaml`**: the frozen copy for judging. It has its own services and database,
  deploys from the `judge` branch, and a push never redeploys it.

Both are checked against Render's schema and against each other by
`apps/workflows/src/blueprint.test.ts`.

## What it creates

| Resource | What it is | Plan | List price |
|---|---|---|---|
| `shakedown-web` | The site, `/docs` and the console | Starter | $7 a month |
| `shakedown-store` | Leaky Llama, the demo store, with a 1 GB disk for its database | Starter | $7 a month, plus $0.25 for the disk |
| `shakedown-runs` | The Render Workflows service that runs campaigns | Billed per second | Under a cent per run |
| `shakedown-db` | Postgres for the console: runs, jobs, their progress, Triage's spend | basic-256mb | $6 a month |

That's about $20 a month per environment. Paid instances don't sleep, so judges never wait for
a cold start, and the database never expires.

## How a hosted run works

1. **The run is queued.** Someone presses **Run the demo shakedown**. The web service writes the
   job to Postgres and starts a `campaign` task run on Render Workflows. The job ID is the
   idempotency key, so a retried request never starts a second run.
2. **Each customer runs as its own task.** The `campaign` task chains one `customer` task per
   customer, in order. Each runs on its own compute and is retried once if it fails.
3. **Results match the CLI.** Each customer picks up the random streams where the last one left
   them. A hosted run therefore draws exactly what the CLI draws with the same seed: seed 2026
   gives 8 leaks, $467.00 for the merchant and $24.00 for customers.
4. **Progress streams to the page.** Each step writes its progress to Postgres as it happens.
   The page reads it from there, so the receipt prints as PayPal's sandbox confirms each leak.
5. **The finished run is stored.** The `campaign` task grades the whole ledger once and stores
   the campaign where the console reads it.

Without `RENDER_API_KEY` and `SHAKEDOWN_WORKFLOW`, the web app runs the same steps itself. That's
how local development works.

The web service and the Workflows service reach the store over Render's private network. The
probe secret never crosses the internet, and the database accepts no outside connections.

## Before you start

- **A Render account.** Claim the hackathon credits there.
- **This repository on GitHub,** connected to Render. Render deploys from the repository.
- **Your PayPal sandbox app's** client ID and secret. Sandbox only: Shakedown refuses any other
  host.
- **A Render API key** for the web service, so it can start workflow runs.
  - Render API keys reach every workspace their owner belongs to, so create one from a Render
    user that belongs only to the Shakedown workspace.
- **Optional:**
  - an Anthropic API key, for Triage in the console and Lulu in the store;
  - the AG Studio licence key.

## Deploy the dev environment

1. **Create the Blueprint.** In the Render Dashboard, choose **New → Blueprint** and pick the
   repository. Render reads `render.yaml`.
2. **Type in the secrets** when Render asks. You don't type the probe secret: Render generates it.

   | Secret | Where | Needed? |
   |---|---|---|
   | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | the `shakedown-sandbox` group | Required |
   | `RENDER_API_KEY` | `shakedown-web` | Required |
   | `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` | `shakedown-web` and `shakedown-store` | Optional; leave blank to switch Triage and Lulu off |
   | `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | `shakedown-web` | Optional; blank shows AG Studio's watermark |
3. **Apply.** Render creates the database and the three services and deploys them.
4. **Check the web service is ready.** Open `https://<shakedown-web URL>/api/console/status`. It
   should say `"live": true` and `"runner": "render-workflows"`. If it says `"live": false`, the
   `reason` field names what isn't answering.
5. **Run the demo** from the site, and watch the run in the Workflows dashboard: one `campaign`
   run, with a `customer` run for each customer.

The Claude caps are `SHAKEDOWN_CONSOLE_AI_BUDGET_USD` for Triage ($0.25) and
`SHAKEDOWN_AI_BUDGET_USD` for Lulu ($0.50). Both are all-time and survive deploys: Triage's spend
is kept in Postgres, and Lulu's on the store's disk.

## Freeze the judges' copy at submission

1. **Tag the submitted commit and give it its own branch:**

   ```bash
   git tag v0.1.0-devpost
   git branch judge v0.1.0-devpost
   git push origin v0.1.0-devpost judge
   ```

2. **Create a second Blueprint from `render.judge.yaml`.** In the Dashboard, choose **New →
   Blueprint**, pick the repository, and set the Blueprint file path to `render.judge.yaml`.
3. **Type in the same kinds of secrets.** A Render API key of its own is best.
4. **Check its `/api/console/status`, then run the demo once.** Put its address in the Devpost
   testing instructions.
5. **Leave it alone until judging ends (December 15).** Its services never redeploy on a push.
   Then delete it and rotate its keys.

## Run the workflow locally

The web app runs campaigns itself unless it's told about a workflow service, so local
development needs none of this. To try the workflow code locally:

1. **Build the workflow bundle:**

   ```bash
   pnpm --filter @shakedown/workflows build
   ```

2. **Start Render's local task server** (from the Render CLI):

   ```bash
   render workflows dev -- node apps/workflows/dist/index.js
   ```

3. **Point the web app at it.** In `.env.local`, set:
   - `RENDER_USE_LOCAL_DEV=true`
   - `SHAKEDOWN_WORKFLOW` to the workflow's local slug
   - `RENDER_API_KEY` to any value

   Then restart the web app.
4. **Give the task server its database.** The workflow writes to the console's Postgres, so set
   `CONSOLE_DATABASE_URL` for both the web app and the task server.
