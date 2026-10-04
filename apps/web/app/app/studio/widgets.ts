'use client'

import type { AgDefaultRegistry, AgWidgetsConfig } from 'ag-studio'
import { type AgWidgetDefinition, createWidgets } from 'ag-studio-react'
import { CastLineupWidget } from './widgets/cast-lineup'
import { FindingDetailWidget } from './widgets/finding-detail'
import { LeakWaterfallWidget } from './widgets/leak-waterfall'
import { LedgerTapeWidget } from './widgets/ledger-tape'
import { ScoreboardWidget } from './widgets/scoreboard'

/**
 * Shakedown's own widgets. Each reads its tables straight from the report schema, so it works
 * the moment it is dropped on a page, and each carries a description the AI agents read when
 * they choose widgets for a request.
 */

const icon = (path: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`

const noSetup = (params: Parameters<AgWidgetDefinition['form']>[0]) =>
  params.createDefaults({ dataMappingItems: [] })

export const SHAKEDOWN_WIDGETS = [
  {
    id: 'sd-scoreboard',
    label: 'Scoreboard',
    icon: icon(
      '<path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6"/>',
    ),
    form: noSetup,
    comp: ScoreboardWidget,
    defaultSize: { width: 340, height: 520 },
    minSize: { width: 260, height: 300 },
    ai: {
      label: 'Scoreboard',
      description:
        'A till receipt of the latest Shakedown run in view: one line per leak with the customer and amount, every customer whose checks held, and the total that would have leaked, stamped SEALED at $0.00. Clicking a line cross-filters the page to that finding.',
      usage: 'Use as the headline of any page about one run. It needs no data mapping.',
    },
  },
  {
    id: 'sd-cast-lineup',
    label: 'Cast lineup',
    icon: icon(
      '<circle cx="7" cy="9" r="3"/><circle cx="17" cy="9" r="3"/><path d="M2 20c1-3 3-5 5-5s4 2 5 5M12 20c1-3 3-5 5-5s4 2 5 5"/>',
    ),
    form: noSetup,
    comp: CastLineupWidget,
    defaultSize: { width: 640, height: 220 },
    minSize: { width: 380, height: 180 },
    ai: {
      label: 'Cast lineup',
      description:
        'The five test customers as imp cards for the latest run in view: red horns and the amount when a customer found a leak, a sulk when every check held. Clicking a card cross-filters the page to that customer.',
      usage: 'Use to show which customer found what at a glance. It needs no data mapping.',
    },
  },
  {
    id: 'sd-leak-waterfall',
    label: 'Leak waterfall',
    icon: icon('<path d="M4 20V14M9 20V10M14 20V6M19 20V4"/><path d="M3 20h18"/>'),
    form: noSetup,
    comp: LeakWaterfallWidget,
    defaultSize: { width: 640, height: 300 },
    minSize: { width: 380, height: 220 },
    ai: {
      label: 'Leak waterfall',
      description:
        'A waterfall of the latest run in view: each customer steps the amount at risk up, merchant leak in red and customer harm in yellow, ending on the total. A sealed run is a flat line at $0.00.',
      usage: 'Use to show where the money would have gone. It needs no data mapping.',
    },
  },
  {
    id: 'sd-finding-detail',
    label: 'Finding detail',
    icon: icon('<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5M8 10h4"/>'),
    form: noSetup,
    comp: FindingDetailWidget,
    defaultSize: { width: 380, height: 520 },
    minSize: { width: 280, height: 300 },
    ai: {
      label: 'Finding detail',
      description:
        "One leak in full: what happened, the evidence quoted from PayPal's sandbox ledger with real IDs, the amount at risk and the fix. Shows the finding picked on the Scoreboard, or the worst leak of the latest run in view.",
      usage: 'Place beside the Scoreboard. It needs no data mapping.',
    },
  },
  {
    id: 'sd-ledger-tape',
    label: 'Ledger tape',
    icon: icon('<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    form: noSetup,
    comp: LedgerTapeWidget,
    defaultSize: { width: 640, height: 520 },
    minSize: { width: 360, height: 260 },
    ai: {
      label: 'Ledger tape',
      description:
        "Every exchange of the latest run in view, in order and grouped by scenario: the customer's actions, the store's answers and PayPal's ledger, with the entries a finding quotes as evidence marked.",
      usage: 'Use to follow a leak step by step. It needs no data mapping.',
    },
  },
] satisfies AgWidgetDefinition[]

export const SHAKEDOWN_WIDGET_IDS = SHAKEDOWN_WIDGETS.map((widget) => widget.id)

export function shakedownWidgets(defaults: AgWidgetsConfig<AgDefaultRegistry>) {
  return createWidgets({
    additionalTypes: SHAKEDOWN_WIDGETS,
    menu: [{ label: 'Shakedown', widgetIds: SHAKEDOWN_WIDGET_IDS }, ...defaults.menu],
  } as never) as unknown as AgWidgetsConfig<AgDefaultRegistry>
}
