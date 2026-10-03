import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

// Phase 1 inbox: store each PayPal webhook exactly as received (raw body plus transmission headers),
// so the S3 spike can verify the signature. Phase 3 replaces this with the store's real handler.
const INBOX = path.join(process.cwd(), '.data', 'webhook-inbox.jsonl')
const MAX_BYTES = 256 * 1024
const TRANSMISSION_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
] as const

export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > MAX_BYTES) return new Response('Payload too large', { status: 413 })
  const headers = Object.fromEntries(TRANSMISSION_HEADERS.map((h) => [h, request.headers.get(h)]))
  await mkdir(path.dirname(INBOX), { recursive: true })
  await appendFile(
    INBOX,
    `${JSON.stringify({ receivedAt: new Date().toISOString(), headers, raw })}\n`,
  )
  return new Response(null, { status: 200 })
}
