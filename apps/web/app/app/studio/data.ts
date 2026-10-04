import type { AgDataSourcesDefinition, AgFieldDefinition } from 'ag-studio'
import type { ConsoleTables } from '../../../lib/console/rows'

/**
 * The console's data, as AG Studio data sources. Field descriptions are written for two readers:
 * the person in the data panel and the AI agents, which read them to plan queries and widgets.
 * Money is in dollars; every amount was graded from PayPal's sandbox ledger, never estimated.
 */

type Field = AgFieldDefinition

const text = (
  id: string,
  name: string,
  description: string,
  extra: Partial<Field> = {},
): Field => ({
  id,
  name,
  description,
  format: 'textFormat',
  ...extra,
})
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (id: string, name: string, description: string): Field => ({
  id,
  name,
  description,
  format: 'currencyFormat',
  formatOptions: { format: USD },
})
const count = (id: string, name: string, description: string): Field => ({
  id,
  name,
  description,
  format: 'integerFormat',
})
const when = (id: string, name: string, description: string): Field => ({
  id,
  name,
  description,
  format: 'dateTimeFormat',
})

/** Dates travel as ISO strings; the data engine wants Date objects. */
const dated = <T extends object>(rows: readonly T[], keys: readonly (keyof T)[]) =>
  rows.map((row) => {
    const copy = { ...row } as Record<string, unknown>
    for (const key of keys) copy[key as string] = new Date(String(row[key]))
    return copy
  })
// Keys stay visible: widgets and agents read them, and a hidden field may not reach the schema.
const keyField = (id: string, name: string, description: string): Field =>
  text(id, name, description, { cardinality: 'high' })
const low = { cardinality: 'low' as const }

export function dataSources(tables: ConsoleTables): AgDataSourcesDefinition {
  return {
    description:
      'Shakedown test runs. Each campaign sends sandbox-only test customers at a PayPal checkout, its webhooks and its support assistant. A check is one property a customer tested; a leak is a check that failed, graded from PayPal sandbox ledger reads. Merchant leak is goods or money that went out with nothing in; customer harm is customers charged for nothing.',
    sources: [
      {
        id: 'campaigns',
        name: 'Campaigns',
        description: 'One row per run of the test customers against a store.',
        data: dated(tables.campaigns, ['started_at']),
        fields: [
          keyField('campaign_id', 'Campaign ID', 'The campaign identifier.'),
          text(
            'run_label',
            'Run',
            'When the run started (UTC), the store switches it used, and its ID.',
            {
              cardinality: 'medium',
            },
          ),
          when('started_at', 'Started', 'When the run started.'),
          text('source', 'Source', 'live (run from this console), cli, or recorded.', low),
          text(
            'switches',
            'Switches',
            'How the demo store was set: all leaky, all sealed, or as shipped.',
            low,
          ),
          text('cast', 'Customers sent', 'The test customers sent, as a comma list of IDs.', low),
          text('verdict', 'Verdict', 'LEAK if any check leaked, otherwise SEALED.', low),
          count('leaks', 'Leaks', 'Checks that failed in this run.'),
          count('sealed_checks', 'Sealed checks', 'Checks that held.'),
          count('inconclusive_checks', 'Inconclusive checks', 'Checks the run could not decide.'),
          count(
            'skipped_scenarios',
            'Skipped scenarios',
            'Scenarios the target could not support.',
          ),
          money('merchant_leak_usd', 'Merchant leak', 'Goods or money out, nothing in, in USD.'),
          money('customer_harm_usd', 'Customer harm', 'Customers charged for nothing, in USD.'),
          money('at_risk_usd', 'At risk', 'Merchant leak plus customer harm, in USD.'),
          count('seed', 'Seed', 'The seed: the same seed replays the same customers and amounts.'),
          text('target', 'Target', 'The store tested.', low),
        ],
      },
      {
        id: 'checks',
        name: 'Checks',
        description:
          'One row per property tested in a run. Verdict is Leak, Sealed or Inconclusive.',
        data: tables.checks,
        fields: [
          keyField('check_id', 'Check ID', 'Unique per campaign, scenario and check.'),
          keyField('campaign_id', 'Campaign ID', 'The campaign this check ran in.'),
          keyField('persona_id', 'Customer ID', 'The test customer that ran the check.'),
          text('persona', 'Customer', 'The test customer: The Double-Clicker, The Echo, ...', low),
          text('scenario', 'Scenario', 'What the customer did.', { cardinality: 'medium' }),
          text('check', 'Check', 'The property that must hold.', { cardinality: 'medium' }),
          text('verdict', 'Verdict', 'Leak, Sealed or Inconclusive.', low),
          text('severity', 'Severity', 'high, medium or low, for leaks only.', low),
          keyField('finding_key', 'Finding key', 'Links a leaking check to its finding.'),
          text('detail', 'Detail', 'Why the check passed or failed.', { cardinality: 'high' }),
          money('merchant_leak_usd', 'Merchant leak', 'Merchant leak from this check, in USD.'),
          money('customer_harm_usd', 'Customer harm', 'Customer harm from this check, in USD.'),
          money('at_risk_usd', 'At risk', 'Merchant leak plus customer harm, in USD.'),
        ],
      },
      {
        id: 'findings',
        name: 'Findings',
        description: 'One row per leak, with the evidence quoted from the ledger and the fix.',
        data: dated(tables.findings, ['found_at']),
        fields: [
          keyField('finding_key', 'Finding key', 'Unique finding identifier.'),
          text('finding_id', 'Finding', 'The finding ID within its campaign.', {
            cardinality: 'high',
          }),
          keyField('campaign_id', 'Campaign ID', 'The campaign this finding belongs to.'),
          keyField('persona_id', 'Customer ID', 'The test customer that found it.'),
          text('persona', 'Customer', 'The test customer that found it.', low),
          text('scenario', 'Scenario', 'What the customer did.', { cardinality: 'medium' }),
          text('check', 'Check', 'The property that failed.', { cardinality: 'medium' }),
          text('severity', 'Severity', 'high, medium or low.', low),
          count('severity_rank', 'Severity rank', '3 for high, 2 for medium, 1 for low.'),
          money('merchant_leak_usd', 'Merchant leak', 'Goods or money out, nothing in, in USD.'),
          money('customer_harm_usd', 'Customer harm', 'Customers charged for nothing, in USD.'),
          money('at_risk_usd', 'At risk', 'Merchant leak plus customer harm, in USD.'),
          text('detail', 'Detail', 'What happened, in plain words.', { cardinality: 'high' }),
          text('fix', 'Fix', 'How to seal it.', { cardinality: 'high' }),
          keyField('evidence', 'Evidence', 'JSON list of label and value, quoted from the ledger.'),
          text('paypal_ids', 'PayPal IDs', 'Sandbox IDs quoted as evidence.', {
            cardinality: 'high',
          }),
          when('found_at', 'Found', 'When the finding was graded.'),
        ],
      },
      {
        id: 'ledger',
        name: 'Ledger',
        description:
          "Every exchange in a run, in order: what the customer did, what the store said, and what PayPal's ledger holds.",
        data: dated(tables.ledger, ['at']),
        fields: [
          keyField('entry_key', 'Entry key', 'Unique ledger entry identifier.'),
          keyField('campaign_id', 'Campaign ID', 'The campaign this entry belongs to.'),
          keyField('persona_id', 'Customer ID', 'The test customer whose scenario this is.'),
          text('persona', 'Customer', 'The test customer.', low),
          text('scenario', 'Scenario', 'What the customer did.', { cardinality: 'medium' }),
          count('seq', 'Order', 'Position of the entry within the run.'),
          text('kind', 'Kind', 'checkout, card, capture, delivery, probe, paypal-order, ...', low),
          when('at', 'At', 'When the exchange happened.'),
          text('summary', 'Summary', 'The exchange in plain words.', { cardinality: 'high' }),
          text('paypal_id', 'PayPal ID', 'The sandbox ID involved, if any.', {
            cardinality: 'high',
          }),
          money('amount_usd', 'Amount', 'The amount involved, in USD, if any.'),
          text('status', 'Status', 'The status or answer reported.', { cardinality: 'medium' }),
          {
            id: 'cited',
            name: 'Cited as evidence',
            description: 'True when a finding quotes this entry.',
            format: 'booleanFormat',
          },
        ],
      },
      {
        id: 'cast',
        name: 'Cast',
        description: 'The test customers and the property each one tests.',
        data: tables.cast,
        fields: [
          text('persona_id', 'Customer ID', 'The test customer identifier.', low),
          count('persona_no', 'Number', 'Its number in the cast.'),
          text('persona', 'Customer', 'The test customer.', low),
          text('tests', 'Tests', 'The property this customer tests.', low),
          text('channel', 'Channel', 'checkout, webhook or support.', low),
        ],
      },
    ],
    relationships: [
      ...(['checks', 'findings', 'ledger'] as const).flatMap((table) => [
        {
          id: `campaigns-${table}`,
          source: { tableId: 'campaigns', fieldId: 'campaign_id' },
          target: { tableId: table, fieldId: 'campaign_id' },
          type: 'one-to-many' as const,
        },
        {
          id: `cast-${table}`,
          source: { tableId: 'cast', fieldId: 'persona_id' },
          target: { tableId: table, fieldId: 'persona_id' },
          type: 'one-to-many' as const,
        },
      ]),
    ],
  }
}
