/**
 * Every number the video shows, taken from the recorded sandbox runs the site itself uses, so
 * the video can never say something the product didn't measure. Writes src/data/runs.json.
 *
 *   pnpm --filter @shakedown/video data
 *
 * It runs from apps/web's folder, where the recordings and their loader live.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { regrade, type SavedRun } from '@shakedown/core'
import { exhibit, goldenRun } from '../../web/lib/golden-run'
import { landingSnippets } from '../../web/lib/landing-snippets'

const here = import.meta.dirname
const recorded = (file: string) =>
  (JSON.parse(readFileSync(path.resolve('fixtures/recorded', file), 'utf8')) as { run: SavedRun })
    .run

const leaky = regrade(recorded('01-checkout-leaky.json'))
const policy = regrade(recorded('03-policy-leaky.json'))
const run = goldenRun()

// The checkout eval's headline, read from the page it writes rather than retyped.
const evalPage = readFileSync(path.resolve(here, '../../../docs/EVAL-CHECKOUT.md'), 'utf8')
const evalMatch =
  /In the (\d+) cases where a customer’s switch was leaky, it reported the leak every time\. In the (\d+) cases where its switch was sealed, it reported none\./.exec(
    evalPage,
  )
if (!evalMatch)
  throw new Error('docs/EVAL-CHECKOUT.md no longer says every leak was caught with no false alarm.')

const data = {
  source: 'apps/web/fixtures/recorded, judged by today’s graders',
  hero: run,
  checkout: {
    campaignId: leaky.campaignId,
    seed: leaky.seed,
    findings: leaky.findings.length,
    merchantLeakCents: leaky.merchantLeakCents,
    customerHarmCents: leaky.customerHarmCents,
    totalCents: leaky.merchantLeakCents + leaky.customerHarmCents,
    findingsByPersona: Object.fromEntries(
      [...new Set(leaky.findings.map((f) => f.persona))].map((p) => [
        p,
        leaky.findings
          .filter((f) => f.persona === p)
          .map((f) => ({
            title: f.title,
            merchantLeakCents: f.merchantLeakCents,
            customerHarmCents: f.customerHarmCents,
            evidence: f.evidence,
            fix: f.fix,
          })),
      ]),
    ),
  },
  policy: {
    campaignId: policy.campaignId,
    findings: policy.findings.length,
    merchantLeakCents: policy.merchantLeakCents,
    customerHarmCents: policy.customerHarmCents,
  },
  exhibit: exhibit(),
  cli: landingSnippets(),
  evaluation: {
    leakyCases: Number(evalMatch[1]),
    sealedCases: Number(evalMatch[2]),
    caught: Number(evalMatch[1]),
    falseAlarms: 0,
  },
}
const out = path.resolve(here, '../src/data/runs.json')
writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`)
console.log(
  `Wrote ${path.relative(process.cwd(), out)}: ${data.checkout.findings} leaks, $${(data.checkout.totalCents / 100).toFixed(2)} in the checkout run.`,
)
