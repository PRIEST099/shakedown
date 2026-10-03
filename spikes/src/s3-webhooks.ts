import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { client, describeError, headlessCardCapture, short, spike } from './lib'

const here = dirname(fileURLToPath(import.meta.url))
const INBOX = resolve(here, '../../apps/leaky-llama/.data/webhook-inbox.jsonl')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface InboxEntry {
  receivedAt: string
  headers: Record<string, string | null>
  raw: string
}

function inbox(): InboxEntry[] {
  if (!existsSync(INBOX)) return []
  return readFileSync(INBOX, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as InboxEntry)
}

async function waitFor(match: (event: Record<string, unknown>) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hit = inbox().find((entry) => match(JSON.parse(entry.raw) as Record<string, unknown>))
    if (hit) return hit
    await sleep(2000)
  }
  return undefined
}

/** Build the verify request around the event's raw bytes, never a re-serialized copy. */
async function verify(entry: InboxEntry, webhookId: string, raw = entry.raw) {
  const h = entry.headers
  const rawJson = `{"auth_algo":${JSON.stringify(h['paypal-auth-algo'])},"cert_url":${JSON.stringify(h['paypal-cert-url'])},"transmission_id":${JSON.stringify(h['paypal-transmission-id'])},"transmission_sig":${JSON.stringify(h['paypal-transmission-sig'])},"transmission_time":${JSON.stringify(h['paypal-transmission-time'])},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${raw}}`
  const res = await client.request<{ verification_status: string }>(
    'POST',
    '/v1/notifications/verify-webhook-signature',
    { rawJson },
  )
  return res.data.verification_status
}

const tunnel = process.env.TUNNEL_URL
if (!tunnel?.startsWith('https://')) throw new Error('Set TUNNEL_URL to the public https URL')

await spike(
  'S3',
  'Real webhooks over HTTPS, verify-webhook-signature, altered events',
  async (note, keep) => {
    const url = `${tunnel}/api/paypal/webhook`
    const created = await client.request<{ id: string }>('POST', '/v1/notifications/webhooks', {
      body: {
        url,
        event_types: [
          { name: 'PAYMENT.CAPTURE.COMPLETED' },
          { name: 'PAYMENT.CAPTURE.REFUNDED' },
          { name: 'CHECKOUT.ORDER.COMPLETED' },
          { name: 'CUSTOMER.DISPUTE.CREATED' },
        ],
      },
    })
    const webhookId = created.data.id
    keep('webhookId', webhookId)
    note({
      claim: 'A webhook can be registered by API',
      verdict: 'CONFIRMED',
      evidence: `webhook ${short(webhookId)} → tunnel`,
    })

    try {
      // 1. A real event: pay, then wait for PayPal to deliver PAYMENT.CAPTURE.COMPLETED.
      const { capture } = await headlessCardCapture('12.00', 's3')
      const t0 = Date.now()
      const real = await waitFor(
        (e) =>
          e.event_type === 'PAYMENT.CAPTURE.COMPLETED' &&
          (e.resource as { id?: string })?.id === capture.id,
        180_000,
      )
      if (!real) {
        note({
          claim: 'A real event reaches the listener',
          verdict: 'REFUTED',
          evidence: 'nothing after 3 min',
        })
        return
      }
      note({
        claim: 'A real PAYMENT.CAPTURE.COMPLETED reaches the listener over HTTPS',
        verdict: 'CONFIRMED',
        evidence: `capture ${short(capture.id)} · delivered ${Math.round((Date.now() - t0) / 1000)} s after payment`,
      })

      const genuine = await verify(real, webhookId)
      note({
        claim: 'verify-webhook-signature accepts the genuine event (raw bytes)',
        verdict: genuine === 'SUCCESS' ? 'CONFIRMED' : 'REFUTED',
        evidence: `verification_status ${genuine}`,
      })

      // 2. The Echo: same headers, body changed by one amount.
      const altered = real.raw.replace('"12.00"', '"1.00"')
      const alteredStatus = await verify(real, webhookId, altered)
      note({
        claim: 'A copy of a genuine event with one amount changed fails verification',
        verdict: altered !== real.raw && alteredStatus === 'FAILURE' ? 'CONFIRMED' : 'REFUTED',
        evidence: `verification_status ${alteredStatus}${altered === real.raw ? ' (body was not changed!)' : ''}`,
      })

      // 3. The webhook simulator's events arrive but are not verifiable.
      const simulated = await client.request<{ id: string }>(
        'POST',
        '/v1/notifications/simulate-event',
        {
          body: {
            webhook_id: webhookId,
            event_type: 'PAYMENT.CAPTURE.COMPLETED',
            resource_version: '2.0',
          },
        },
      )
      const sim = await waitFor((e) => e.id === simulated.data.id, 120_000)
      if (sim) {
        const status = await verify(sim, webhookId)
        // Observed 2026-10-03: simulator events sent to a registered webhook are signed and verify.
        // That lets the Echo send genuinely signed duplicates and out-of-order events.
        note({
          claim: 'Simulator events sent to our webhook arrive signed (they pass verification)',
          verdict: status === 'SUCCESS' ? 'CONFIRMED' : 'PARTIAL',
          evidence: `simulated event ${short(simulated.data.id)} · verification_status ${status}`,
        })
      } else {
        note({
          claim: 'Simulator events arrive',
          verdict: 'PARTIAL',
          evidence: 'not delivered within 2 min',
        })
      }
    } catch (error) {
      note({ claim: 'S3 steps ran', verdict: 'REFUTED', evidence: describeError(error) })
    } finally {
      await client.request('DELETE', `/v1/notifications/webhooks/${webhookId}`)
      note({
        claim: 'Cleanup: the temporary webhook registration is deleted',
        verdict: 'CONFIRMED',
        evidence: short(webhookId),
      })
    }
  },
)
