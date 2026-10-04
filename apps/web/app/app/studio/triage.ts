'use client'

import type { AgAiHarnessSetupParams, AgAiPromptStarter, AgAiTelemetryObserver } from 'ag-studio'
import { createAiHarness, directLlmRunner } from 'ag-studio'
import type { ConsoleTables } from '../../../lib/console/rows'
import { leakSummary } from '../../../lib/console/summary'
import { consoleAdapter } from './adapter'

/**
 * Triage: Shakedown's own agent, and the one a conversation starts with. It knows the domain
 * (the cast, what a leak is, what to fix first) and owns one tool, leak_summary, whose numbers
 * are computed in code. For anything else it hands over to AG Studio's built-in agents: Data for
 * questions about the tables, Lead to build or rearrange the dashboard, Widget to adjust one.
 */

export const PROMPT_STARTERS: AgAiPromptStarter[] = [
  {
    label: 'Which customer leaked most?',
    prompt:
      'Across the last 5 runs, which test customer put the most money at risk, and what should we fix first?',
  },
  {
    label: 'Explain the worst leak',
    prompt:
      'Explain the worst leak in the latest run in plain words: what happened, the evidence and the fix.',
  },
  {
    label: 'Did the fixes hold?',
    prompt:
      'Compare the latest all-leaky run with the latest all-sealed run. Which checks went from Leak to Sealed?',
  },
  {
    label: 'Chart it',
    prompt: 'Add a bar chart of the amount at risk by test customer to the Across runs page.',
  },
]

/**
 * Every agent stops after this many rounds: a backstop, so no loop can run up a bill. Building one
 * widget took Lead, Planning, Page and Widget about four rounds each when measured.
 */
const MAX_TURNS = 8

function instructions(tables: ConsoleTables): string {
  const latest = [...tables.campaigns].sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  return [
    "You are Triage, the QA lead in Shakedown's console. Shakedown sends sandbox-only test customers at a store's own PayPal checkout, webhook listener and support assistant, then grades every check from PayPal's sandbox ledger. A leak is a check that failed. Merchant leak is goods or money that went out with nothing in; customer harm is customers charged for nothing.",
    'The cast: The Double-Clicker (one checkout is charged once), The Cart Shuffler (what ships matches what PayPal captured), The Echo (webhooks are verified and acted on once), The Bouncer (a declined card never ships), The Policy Lawyer (the support assistant follows the refund policy).',
    'How you work:',
    '- For how much would have leaked, which customer leaked most, or what to fix first, call leak_summary. Its amounts are computed in code from graded results: quote them exactly and never estimate.',
    '- For any other question about the data, delegate to the data agent.',
    '- To add or rearrange widgets, delegate to lead and name the page: run, ledger or trend (shown as Across runs). No tool can create a new page. To adjust one existing widget, delegate to widget with its type and id (view_page lists them).',
    '- Never guess which customer or check caused something. If the numbers you have do not say, delegate to the data agent, or say that you do not know.',
    '- Inconclusive means a run could not decide a check. Most often it is The Echo against a store that verifies webhook signatures: only PayPal can sign, so duplicates and late events cannot be tested there.',
    '- Answer in a few short sentences or bullets, in plain words. Say "would have leaked" or "at risk", name the fix from the finding, and remember every run was in the PayPal sandbox.',
    latest
      ? `Right now the console holds ${tables.campaigns.length} runs; the latest is "${latest.run_label}", verdict ${latest.verdict}.`
      : 'The console holds no runs yet.',
  ].join('\n')
}

export function triageHarness(getTables: () => ConsoleTables, observer: AgAiTelemetryObserver) {
  const adapter = consoleAdapter()
  return ({ api }: AgAiHarnessSetupParams) =>
    createAiHarness(api, ({ builtIn, tools }) => {
      const summaryTool = api.defineAiTool({
        name: 'leak_summary',
        description:
          'Exact totals for the most recent runs: each run with its verdict and amounts, each test customer with leaks, seals and money at risk, and the three worst leaks with their fixes. Computed in code from graded results.',
        params: (s) =>
          s.object({
            lastRuns: s
              .number({ description: 'How many of the most recent runs to count. Default 5.' })
              .optional(),
          }),
        execute: (args: { lastRuns?: number }, ctx) => {
          // Only the text: a structured payload would be serialised to the model a second time.
          return ctx.success(JSON.stringify(leakSummary(getTables(), args.lastRuns ?? 5)))
        },
      })
      return {
        agents: [
          directLlmRunner({
            id: 'triage',
            name: 'Triage',
            description:
              "Shakedown's QA lead: answers questions about leaks and hands dashboard work to the built-in agents.",
            adapter,
            maxTurns: MAX_TURNS,
            instructions: () => instructions(getTables()),
            tools: () => [
              summaryTool,
              tools.studio.viewPage(),
              tools.delegateTo(['data', 'lead', 'widget']),
            ],
          }),
          ...Object.values(builtIn).map((definition) =>
            directLlmRunner({ ...definition, adapter, maxTurns: MAX_TURNS }),
          ),
        ],
        primary: 'triage',
        promptStarters: PROMPT_STARTERS,
        observers: [observer],
      }
    })
}
