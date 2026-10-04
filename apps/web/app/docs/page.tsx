import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '../_landing/site-footer'
import { SiteHeader } from '../_landing/site-header'
import '../_components/site.css'
import './docs.css'

export const metadata: Metadata = {
  title: 'Docs · Shakedown',
  description:
    'Run Shakedown against your own PayPal sandbox checkout: the CLI, the config file, what your store needs to answer, CI, the console and how each safety rule is enforced.',
}

const SECTIONS = [
  { id: 'cli', label: 'Quick start' },
  { id: 'store', label: 'What your store answers' },
  { id: 'config', label: 'Config' },
  { id: 'ci', label: 'CI' },
  { id: 'console', label: 'The console' },
  { id: 'decides', label: 'How it decides' },
  { id: 'responsible-use', label: 'Responsible use' },
]

function Code({ children }: { children: string }) {
  return (
    <pre className="docs-code">
      <code>{children}</code>
    </pre>
  )
}

export default function DocsPage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <div className="docs">
        <nav className="docs__toc" aria-label="On this page">
          <p className="label">On this page</p>
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>
        <main id="main" className="docs__body">
          <p className="label">Docs</p>
          <h1 className="display-l">Run Shakedown against your own checkout</h1>
          <p className="docs__lede">
            Shakedown sends six sandbox-only test customers at your own PayPal checkout, webhook
            listener and support assistant. It grades each one from PayPal’s sandbox ledger, not
            from what your store says, and prints a receipt for every dollar that would have leaked.
          </p>

          <section id="cli" aria-labelledby="cli-h">
            <h2 id="cli-h">Quick start</h2>
            <p>
              You need Node 22.18 or later and a PayPal sandbox app. Always use the scoped package
              name: a bare <code>npx shakedown</code> runs an unrelated package.
            </p>
            <Code>{`npx @shakedown-dev/cli preflight --target http://localhost:3000
npx @shakedown-dev/cli run --target http://localhost:3000
npx @shakedown-dev/cli report`}</Code>
            <p>
              <code>preflight</code> checks your setup, the sandbox lock and your store.{' '}
              <code>run</code> sends the customers and writes the reports to{' '}
              <code>.shakedown/</code>. <code>report</code> opens the HTML report, or prints the
              last run as the terminal receipt, Markdown, JUnit or JSON.
            </p>
            <h3>Environment</h3>
            <p>
              Secrets come from the environment or <code>.env.local</code>, never from the config
              file, and Shakedown never prints them.
            </p>
            <table className="docs-table">
              <thead>
                <tr>
                  <th scope="col">Variable</th>
                  <th scope="col">What it’s for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>PAYPAL_CLIENT_ID</code>, <code>PAYPAL_CLIENT_SECRET</code>
                  </td>
                  <td>Your sandbox app. Without them, the checkout customers are skipped.</td>
                </tr>
                <tr>
                  <td>
                    <code>SHAKEDOWN_PROBE_SECRET</code>
                  </td>
                  <td>16+ characters, shared with your store’s read-only probe route.</td>
                </tr>
                <tr>
                  <td>
                    <code>SHAKEDOWN_VERIFICATION_TOKEN</code>
                  </td>
                  <td>For a store that isn’t local: served at /.well-known/shakedown.txt.</td>
                </tr>
                <tr>
                  <td>
                    <code>ANTHROPIC_API_KEY</code>
                  </td>
                  <td>
                    Optional: only for --explain, and to read a refund policy written in prose.
                  </td>
                </tr>
              </tbody>
            </table>
            <h3>Exit codes</h3>
            <p>
              0 pass · 1 leaks · 2 inconclusive (strict mode) · 3 safety lock · 4 config · 5 the
              store isn’t answering.
            </p>
          </section>

          <section id="store" aria-labelledby="store-h">
            <h2 id="store-h">What your store needs to answer</h2>
            <p>
              Shakedown talks to your store over HTTP. Leaky Llama, the demo store in this
              repository, is the reference implementation.
            </p>
            <table className="docs-table">
              <thead>
                <tr>
                  <th scope="col">Route</th>
                  <th scope="col">For</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>GET /api/catalog</code>
                  </td>
                  <td>The products a customer can buy</td>
                </tr>
                <tr>
                  <td>
                    <code>POST /api/checkout/orders</code>
                  </td>
                  <td>Open a checkout (creates the PayPal order)</td>
                </tr>
                <tr>
                  <td>
                    <code>POST /api/checkout/orders/:id/capture</code>
                  </td>
                  <td>Capture it, as your checkout page would</td>
                </tr>
                <tr>
                  <td>
                    <code>POST /api/paypal/webhook</code>
                  </td>
                  <td>Your webhook listener</td>
                </tr>
                <tr>
                  <td>
                    <code>GET /api/probe/orders/:id</code>
                  </td>
                  <td>
                    Read-only: what your store believes about an order. It must refuse any request
                    without the <code>x-shakedown-probe</code> secret.
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>POST /api/support/chat</code>
                  </td>
                  <td>The Policy Lawyer only: your support assistant</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="config" aria-labelledby="config-h">
            <h2 id="config-h">Config</h2>
            <p>
              Shakedown loads the first{' '}
              <code>shakedown.config.{'{ts,mts,js,mjs,json,yaml,yml}'}</code> it finds. Unknown
              settings are an error, and so is anything that looks like a secret.
            </p>
            <Code>{`import { defineConfig } from '@shakedown-dev/cli'

export default defineConfig({
  target: { url: 'http://localhost:3000' },
  cast: ['double-clicker', 'cart-shuffler', 'echo', 'bouncer'],
  seed: 2026, // the same seed replays the same customers and amounts
  budget: { minutes: 10 },
})`}</Code>
            <p>
              By default a run sends the four customers that need no AI, so it costs nothing beyond
              sandbox calls. Add <code>policy-lawyer</code> to test your support assistant, with
              your refund policy as rules in <code>policy</code>.
            </p>
          </section>

          <section id="ci" aria-labelledby="ci-h">
            <h2 id="ci-h">CI</h2>
            <p>
              The build fails on a leak (exit code 1), and <code>comment</code> keeps one scoreboard
              comment on the pull request up to date, using the workflow’s own token.
            </p>
            <Code>{`- run: npx @shakedown-dev/cli run --ci
  env:
    PAYPAL_CLIENT_ID: \${{ secrets.PAYPAL_CLIENT_ID }}
    PAYPAL_CLIENT_SECRET: \${{ secrets.PAYPAL_CLIENT_SECRET }}
    SHAKEDOWN_PROBE_SECRET: \${{ secrets.SHAKEDOWN_PROBE_SECRET }}
- if: always() && github.event_name == 'pull_request'
  run: npx @shakedown-dev/cli comment
  env:
    GITHUB_TOKEN: \${{ github.token }}`}</Code>
          </section>

          <section id="console" aria-labelledby="console-h">
            <h2 id="console-h">The console</h2>
            <p>
              The <Link href="/app">console</Link> is an AG Studio dashboard over every run: the
              Scoreboard, the cast, the leak waterfall, each finding with its evidence, and the
              ledger. Click a leak or a customer and the rest of the page follows. Its Triage agent
              answers questions from a summary computed in code, and hands everything else to AG
              Studio’s built-in agents. Its Claude spend has its own cap.
            </p>
          </section>

          <section id="decides" aria-labelledby="decides-h">
            <h2 id="decides-h">How it decides</h2>
            <p>
              The AI plays the customer; code keeps the score. A check passes or fails from PayPal’s
              sandbox records: captures, refunds and the webhooks the store accepted. The same seed
              gives the same verdicts and amounts on every re-run, and a saved run can be judged
              again by newer graders without repeating a call. The model never decides whether money
              leaked.
            </p>
          </section>

          <section id="responsible-use" aria-labelledby="responsible-h">
            <h2 id="responsible-h">Responsible use, and how each rule is enforced</h2>
            <dl className="docs-rules">
              <dt>Sandbox only</dt>
              <dd>
                Every PayPal call goes through a sandbox lock that refuses any host but the sandbox
                API (<code>packages/paypal/src/sandbox-lock.ts</code>), and <code>PAYPAL_ENV</code>{' '}
                must be <code>sandbox</code> or nothing runs.
              </dd>
              <dt>Your integration only</dt>
              <dd>
                A target must be local or on a private network, or allow-listed and serving your
                verification token, before the first request (
                <code>packages/core/src/guards.ts</code>
                ).
              </dd>
              <dt>Fictional customers</dt>
              <dd>
                The cast are scripted test characters. They pay with PayPal’s published sandbox test
                cards and use generated example.com addresses.
              </dd>
              <dt>Bounded by design</dt>
              <dd>
                Each campaign has a request and wall-clock budget, and every Claude call passes a
                spend gate with a hard cap that refuses before anything is sent (
                <code>packages/ai/src/gate.ts</code>).
              </dd>
              <dt>Outcomes, not playbooks</dt>
              <dd>
                Findings report what would have leaked, the evidence and the fix. See{' '}
                <code>RESPONSIBLE_USE.md</code> and <code>SECURITY.md</code> in the repository.
              </dd>
            </dl>
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  )
}
