import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv, requireEnv } from '@shakedown/core'
import {
  type Capture,
  type CardSource,
  captureOrder,
  capturesOf,
  createOrder,
  type Order,
  PayPalApiError,
  PayPalSandboxClient,
  payerActionLink,
  usd,
} from '@shakedown/paypal'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const env = requireEnv(loadEnv(), ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'])

export const clientId = env.PAYPAL_CLIENT_ID
export const client = new PayPalSandboxClient({
  clientId: env.PAYPAL_CLIENT_ID,
  clientSecret: env.PAYPAL_CLIENT_SECRET,
})

/** PayPal's published sandbox test card (developer.paypal.com/sandbox-testing/card-testing). */
export function testCard(name = 'Shakedown Spike'): CardSource {
  return {
    number: '4012888888881881',
    expiry: '2030-12',
    security_code: '123',
    name,
    billing_address: {
      address_line_1: '1 Test Street',
      admin_area_2: 'San Jose',
      admin_area_1: 'CA',
      postal_code: '95131',
      country_code: 'US',
    },
  }
}

export function cardOrderBody(value: string, reference: string, cardName?: string) {
  return {
    intent: 'CAPTURE',
    purchase_units: [
      { reference_id: reference, description: `Shakedown spike ${reference}`, amount: usd(value) },
    ],
    payment_source: {
      card: {
        ...testCard(cardName),
        attributes: { verification: { method: 'SCA_WHEN_REQUIRED' } },
      },
    },
  }
}

/** Create a card order and capture it without a browser. Throws if PayPal asks for 3DS. */
export async function headlessCardCapture(
  value: string,
  reference: string,
): Promise<{ created: Order; order: Order; capture: Capture }> {
  const created = (await createOrder(client, cardOrderBody(value, reference))).data
  if (payerActionLink(created))
    throw new Error(`PayPal asked for payer action (3DS) on ${reference}`)
  const order =
    created.status === 'COMPLETED' ? created : (await captureOrder(client, created.id)).data
  const capture = capturesOf(order)[0]
  if (!capture) throw new Error(`No capture on order ${short(order.id)} (status ${order.status})`)
  return { created, order, capture }
}

/** Shorten an ID for console output. Full IDs go to the local results file. */
export const short = (id: string | undefined) => (id ? `${id.slice(0, 6)}…${id.slice(-4)}` : '—')

export type Verdict = 'CONFIRMED' | 'REFUTED' | 'PARTIAL'

export interface Finding {
  claim: string
  verdict: Verdict
  evidence: string
}

const MARK: Record<Verdict, string> = { CONFIRMED: '✓', PARTIAL: '~', REFUTED: '✗' }

export function describeError(error: unknown): string {
  if (error instanceof PayPalApiError) {
    return [
      error.status,
      error.errorName,
      error.issue,
      error.message,
      `debug ${error.debugId ?? '—'}`,
    ]
      .filter(Boolean)
      .join(' · ')
  }
  return error instanceof Error ? error.message : String(error)
}

/** Run one spike, print its findings, and keep the evidence in spikes/results/<id>.json. */
export async function spike(
  id: string,
  title: string,
  run: (
    note: (finding: Finding) => void,
    keep: (key: string, value: unknown) => void,
  ) => Promise<void>,
): Promise<Finding[]> {
  console.log(`\n${id} · ${title}`)
  const findings: Finding[] = []
  const kept: Record<string, unknown> = {}
  const note = (finding: Finding) => {
    findings.push(finding)
    console.log(`  ${MARK[finding.verdict]} ${finding.claim}\n      ${finding.evidence}`)
  }
  try {
    await run(note, (key, value) => {
      kept[key] = value
    })
  } catch (error) {
    note({ claim: 'Spike ran to completion', verdict: 'REFUTED', evidence: describeError(error) })
  }
  const dir = resolve(here, '../results')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${id.toLowerCase()}.json`),
    `${JSON.stringify({ id, title, ranAt: new Date().toISOString(), findings, kept }, null, 2)}\n`,
  )
  return findings
}
