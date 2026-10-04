import type { AgReportState } from 'ag-studio'

/**
 * The console as it opens: three pages on a 24-column grid. Shakedown's widgets carry the story
 * (the Tape, the cast, the waterfall, the finding, the ledger); AG Studio's own grid, charts and
 * filters sit beside them, so every view can be reshaped in the editor or by the agents.
 */

const title = (text: string) => ({ title: { text, enabled: true } })
const field = (id: string, aggregation?: 'sum' | 'count' | 'max') => ({
  id,
  ...(aggregation ? { aggregation } : {}),
})

const campaignFilter = {
  type: 'button-filter',
  dataMapping: { value: [field('campaigns.run_label')] },
  format: { title: { text: 'Run', enabled: false }, style: { selection: { type: 'single' } } },
}

export const INITIAL_STATE = {
  selectedPageId: 'run',
  // Room for the canvas: the AI panel stays open, the editing panels start folded away.
  panels: { data: { collapsed: true }, filters: { collapsed: true }, edit: { collapsed: true } },
  pages: [
    {
      id: 'run',
      widgets: {
        runFilter: campaignFilter,
        runTape: { type: 'sd-scoreboard', dataMapping: {}, format: title('Scoreboard') },
        runCast: { type: 'sd-cast-lineup', dataMapping: {}, format: title('The cast') },
        runWaterfall: {
          type: 'sd-leak-waterfall',
          dataMapping: {},
          format: title('Where it would have gone'),
        },
        runFinding: { type: 'sd-finding-detail', dataMapping: {}, format: title('Finding') },
        runLeaks: {
          type: 'grid',
          dataMapping: {
            cols: [
              field('campaigns.run_label'),
              field('findings.persona'),
              field('findings.check'),
              field('findings.severity'),
              field('findings.merchant_leak_usd'),
              field('findings.customer_harm_usd'),
              field('findings.paypal_ids'),
            ],
          },
          format: title('Leaks in every run in view'),
        },
      },
      widgetLayout: {
        runFilter: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 6 },
        runTape: { xTrack: 0, yTrack: 6, xSpan: 7, ySpan: 22 },
        runCast: { xTrack: 7, yTrack: 6, xSpan: 10, ySpan: 10 },
        runWaterfall: { xTrack: 7, yTrack: 16, xSpan: 10, ySpan: 12 },
        runFinding: { xTrack: 17, yTrack: 6, xSpan: 7, ySpan: 22 },
        runLeaks: { xTrack: 0, yTrack: 28, xSpan: 24, ySpan: 10 },
      },
    },
    {
      id: 'ledger',
      widgets: {
        ledgerFilter: campaignFilter,
        ledgerTape: { type: 'sd-ledger-tape', dataMapping: {}, format: title('Ledger tape') },
        ledgerCast: {
          type: 'sd-cast-lineup',
          dataMapping: {},
          format: title('Filter by customer'),
        },
        ledgerEntries: {
          type: 'grid',
          dataMapping: {
            cols: [
              field('ledger.persona'),
              field('ledger.kind'),
              field('ledger.paypal_id'),
              field('ledger.amount_usd'),
              field('ledger.status'),
              field('ledger.cited'),
            ],
          },
          format: title('Entries'),
        },
      },
      widgetLayout: {
        ledgerFilter: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 6 },
        ledgerTape: { xTrack: 0, yTrack: 6, xSpan: 14, ySpan: 28 },
        ledgerCast: { xTrack: 14, yTrack: 6, xSpan: 10, ySpan: 10 },
        ledgerEntries: { xTrack: 14, yTrack: 16, xSpan: 10, ySpan: 18 },
      },
    },
    {
      id: 'trend',
      widgets: {
        trendByRun: {
          type: 'column-chart-stacked',
          dataMapping: {
            categoryKey: [field('campaigns.run_label')],
            valueKey: [field('checks.at_risk_usd', 'sum')],
            legendKey: [field('checks.persona')],
          },
          format: title('At risk per run, by customer'),
        },
        trendMerchant: {
          type: 'value',
          dataMapping: { value: [field('campaigns.merchant_leak_usd', 'sum')] },
          format: title('Merchant leak, all runs'),
        },
        trendLeaks: {
          type: 'value',
          dataMapping: { value: [field('campaigns.leaks', 'sum')] },
          format: title('Leaks, all runs'),
        },
        trendRuns: {
          type: 'grid',
          dataMapping: {
            cols: [
              field('campaigns.run_label'),
              field('campaigns.source'),
              field('campaigns.verdict'),
              field('campaigns.leaks'),
              field('campaigns.merchant_leak_usd'),
              field('campaigns.customer_harm_usd'),
            ],
          },
          format: title('Runs'),
        },
      },
      widgetLayout: {
        trendByRun: { xTrack: 0, yTrack: 0, xSpan: 16, ySpan: 14 },
        trendMerchant: { xTrack: 16, yTrack: 0, xSpan: 8, ySpan: 7 },
        trendLeaks: { xTrack: 16, yTrack: 7, xSpan: 8, ySpan: 7 },
        trendRuns: { xTrack: 0, yTrack: 14, xSpan: 24, ySpan: 10 },
      },
    },
  ],
} as unknown as AgReportState
