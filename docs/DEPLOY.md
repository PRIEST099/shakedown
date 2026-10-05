# Deploying Shakedown on Render

Two Blueprints describe the hosted demo:

- **`render.yaml`**: the dev environment. It deploys from `main` on every push.
- **`render.judge.yaml`**: the frozen copy for judging. It has its own services and database,
  deploys from the `judge` branch, and a push never redeploys it.

`apps/workflows/src/blueprint.test.ts` checks them against each other and against Render's rules
(no committed secret, no prompted secret inside a group, a 1 GB database). Both also validate
against Render's published schema, https://render.com/schema/render.yaml.json.

## What it creates

| Resource | What it is | Plan | List price |
|---|---|---|---|
| `shakedown-web` | The site, `/docs` and the console | Starter | $7 a month |
| `shakedown-store` | Leaky Llama, the demo store: its orders in a database of their own (`leaky_llama`) inside `shakedown-db`, and a 1 GB disk for Lulu's spend log | Starter | $7 a month, plus $0.25 for the disk |
| `shakedown-runs` | The Render Workflows service that runs campaigns | Billed per second | Under a cent per run |
| `shakedown-db` | Postgres for the console: runs, jobs, their progress, Triage's spend | basic-256mb, 1 GB of storage | $6 a month, plus $0.30 for the storage |

That's about $20.55 a month per environment, plus a few cents of Workflows time (October 2026
prices). Paid instances don't sleep, so judges never wait for a cold start, and the database
never expires. Render renamed its plans in August 2026 (Starter is now `0.5c-512mb`, basic-256mb
is `0.1c-256mb`); the old names still work in Blueprints.

The database's storage is set to 1 GB on purpose: left out, a Basic database gets 15 GB ($4.50 a
month), and storage can grow later but never shrink.

Locally the store runs on PGlite, a Postgres that runs inside the app. Hosted, it can't: PGlite
needs about 900 MB of memory and a Starter instance has 512 MB. So the store creates its own
`leaky_llama` database inside the console's Postgres on its first start, keeping its tables and
migrations apart at no extra cost, and runs in under 200 MB.

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

- **A Render account,** with a payment card on file (paid instances need one). Claim the
  hackathon's Render credits there first.
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
2. **Type in the secrets** when Render asks. It asks only now, while the Blueprint is created;
   later, you change them on each service's **Environment** page. You don't type the probe
   secret: Render generates it.

   | Secret | Where | Needed? |
   |---|---|---|
   | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | `shakedown-web`, `shakedown-store` and `shakedown-runs` (the same two values, three times) | Required |
   | `RENDER_API_KEY` | `shakedown-web` | Required |
   | `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` | `shakedown-web` and `shakedown-store` | Optional; leave blank to switch Triage and Lulu off |
   | `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | `shakedown-web` | Optional; blank shows AG Studio's watermark |

   The PayPal keys sit on each service rather than in the shared `shakedown-sandbox` group
   because Render never prompts for a secret inside a group.

   **If a service was created after the Blueprint itself** (say, a first sync stopped partway),
   Render never asks for its secrets. Type them in on that service's **Environment** page, and
   save with **Save, rebuild, and deploy**.
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
   To change one of its settings, save the change and then deploy by hand (**Manual Deploy →
   Deploy latest commit**).

## Clean up afterwards

Render recreates any Blueprint-managed resource you delete while the Blueprint still lists it, so
take them down in this order:

1. **Disconnect the Blueprint** (its Settings page). That stops the syncing; it deletes nothing.
2. **Delete each service.**
3. **Delete the database** (its Info page). Render keeps no backup after that.
4. **Revoke the Render API key** in Account Settings, and the PayPal sandbox app's secret if you
   no longer need it.

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
