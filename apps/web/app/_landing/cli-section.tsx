import type { LandingSnippets } from '../../lib/landing-snippets'
import { CopyButton } from '../_components/copy-button'
import { Tabs } from '../_components/tabs'

const WORKFLOW = `# .github/workflows/shakedown.yml (start your store first)
permissions:
  contents: read
  pull-requests: write
steps:
  - run: npx @shakedown-dev/cli run --ci
    env:
      PAYPAL_CLIENT_ID: \${{ secrets.PAYPAL_CLIENT_ID }}
      PAYPAL_CLIENT_SECRET: \${{ secrets.PAYPAL_CLIENT_SECRET }}
      SHAKEDOWN_PROBE_SECRET: \${{ secrets.SHAKEDOWN_PROBE_SECRET }}
  - if: always() && github.event_name == 'pull_request'
    run: npx @shakedown-dev/cli comment
    env:
      GITHUB_TOKEN: \${{ github.token }}`

const CONFIG = `// shakedown.config.ts
import { defineConfig } from '@shakedown-dev/cli'

export default defineConfig({
  target: { url: 'http://localhost:3000' },
  seed: 2026, // the same seed replays the same customers and amounts
  budget: { minutes: 10 },
})`

/** Colours the verdict words the way the receipt does: red for leaks, teal for sealed. */
function Terminal({ text }: { text: string }) {
  return (
    <pre className="term">
      <span className="term__head">Terminal</span>
      <code>
        {text.split('\n').map((line, index) => {
          const tone =
            line.includes('✗') || /LEAK|MERCHANT|CUSTOMER/.test(line)
              ? 'leak'
              : line.startsWith('$')
                ? 'cmd'
                : undefined
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: static lines that never reorder
            <span key={index} className={tone ? `term__line is-${tone}` : 'term__line'}>
              {line || ' '}
              {'\n'}
            </span>
          )
        })}
      </code>
    </pre>
  )
}

export function CliSection({ snippets }: { snippets: LandingSnippets }) {
  const { comment } = snippets
  return (
    <section id="cli" className="section" aria-labelledby="cli-title">
      <p className="label">CLI and CI</p>
      <h2 id="cli-title" className="display-l section__title">
        Same receipt in your terminal and in CI.
      </h2>
      <p className="section__lede">
        Run the cast locally against your own store. Then keep it in CI: if a leak comes back, the
        build fails and the pull request gets the receipt.
      </p>
      <Tabs
        storageKey="sd-cli-tab"
        tabs={[
          {
            id: 'cli',
            label: 'CLI',
            content: (
              <>
                <div className="install-chip">
                  <code>
                    <span aria-hidden="true">$ </span>npx @shakedown-dev/cli run
                  </code>
                  <CopyButton text="npx @shakedown-dev/cli run" />
                </div>
                <Terminal text={snippets.cliOutput} />
                <p className="fine-print">
                  Real output from a recorded run against Leaky Llama. Always use the scoped name: a
                  bare <code>npx shakedown</code> runs an unrelated package.
                </p>
              </>
            ),
          },
          {
            id: 'ci',
            label: 'GitHub Actions',
            content: (
              <div className="ci-grid">
                <pre className="term">
                  <span className="term__head">Workflow</span>
                  <code>{WORKFLOW}</code>
                </pre>
                <figure className="pr-comment">
                  <figcaption className="sd-sr-only">The pull-request comment it posts</figcaption>
                  <p className="pr-comment__who">github-actions commented</p>
                  <p className="pr-comment__headline">{comment.headline}</p>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Customer</th>
                        <th scope="col">Result</th>
                        <th scope="col">At risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comment.rows.map((row) => (
                        <tr key={row.customer}>
                          <td>{row.customer}</td>
                          <td className={`is-${row.result}`}>
                            {row.result === 'leak'
                              ? `▼ ${row.leaks} ${row.leaks === 1 ? 'leak' : 'leaks'}`
                              : '✓ Sealed'}
                          </td>
                          <td className="num">{row.atRisk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="pr-comment__foot">
                    Measured in the PayPal sandbox; no real money moved.
                  </p>
                </figure>
              </div>
            ),
          },
          {
            id: 'config',
            label: 'Config',
            content: (
              <pre className="term">
                <span className="term__head">shakedown.config.ts</span>
                <code>{CONFIG}</code>
              </pre>
            ),
          },
        ]}
      />
    </section>
  )
}
