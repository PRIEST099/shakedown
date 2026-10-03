import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { VERIFICATION_PATH } from '../guards'
import type { Cents } from '../money'
import type {
  DeliveryOptions,
  DeliveryResult,
  OpenedOrder,
  OrderState,
  TargetAdapter,
  WebhookEvent,
} from '../target'

/**
 * A small, real webhook listener to develop the engine against. It is a fixture, not a demo:
 * Phase 3 replaces it with Leaky Llama Supply Co. and the same adapter interface.
 *
 * Each flag is one property, so a scenario can be run against a listener that holds exactly
 * one of them wrong. Sealed is the shape the docs recommend; leaky is the shape people ship.
 */
export interface FixtureFlags {
  /** Check the signature over the raw body before acting on an event. */
  verifySignature: boolean
  /** Remember event IDs already processed and skip repeats. */
  dedupeEvents: boolean
  /** Ignore an event older than the last one applied to the same resource. */
  guardEventOrder: boolean
}

export const LEAKY: FixtureFlags = {
  verifySignature: false,
  dedupeEvents: false,
  guardEventOrder: false,
}

export const SEALED: FixtureFlags = {
  verifySignature: true,
  dedupeEvents: true,
  guardEventOrder: true,
}

interface FixtureOrder {
  orderId: string
  captureId: string
  status: 'pending' | 'fulfilled' | 'refunded'
  fulfillmentCount: number
  amountCents: Cents
  currency: string
  lastEventAt: string
}

export interface FixtureTarget {
  origin: string
  adapter: TargetAdapter
  flags: FixtureFlags
  setFlags(next: Partial<FixtureFlags>): void
  reset(): void
  orders(): FixtureOrder[]
  close(): Promise<void>
}

export interface FixtureOptions {
  flags?: FixtureFlags
  webhookSecret?: string
  probeSecret?: string
  verificationToken?: string
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(text)
}

const readRaw = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

/**
 * Sign the raw transmission the way a listener must verify it: over the bytes, with the
 * transmission id and time bound in, before anyone parses JSON. PayPal uses RSA over an
 * equivalent string; HMAC keeps the fixture self-contained without changing the lesson.
 */
export function signTransmission(
  secret: string,
  parts: { transmissionId: string; transmissionTime: string; raw: Buffer | string },
): string {
  return createHmac('sha256', secret)
    .update(`${parts.transmissionId}|${parts.transmissionTime}|`)
    .update(parts.raw)
    .digest('base64')
}

function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function startFixtureTarget(options: FixtureOptions = {}): Promise<FixtureTarget> {
  const flags: FixtureFlags = { ...(options.flags ?? LEAKY) }
  const webhookSecret = options.webhookSecret ?? 'fixture-webhook-secret'
  const probeSecret = options.probeSecret ?? 'fixture-probe-secret-0123456789'
  const verificationToken = options.verificationToken ?? 'fixture-verification-token'

  const orders = new Map<string, FixtureOrder>()
  const processedEvents = new Set<string>()
  let sequence = 0

  const handleWebhook = async (req: IncomingMessage, res: ServerResponse) => {
    const raw = await readRaw(req)

    if (flags.verifySignature) {
      const id = String(req.headers['paypal-transmission-id'] ?? '')
      const time = String(req.headers['paypal-transmission-time'] ?? '')
      const sig = String(req.headers['paypal-transmission-sig'] ?? '')
      const expected = signTransmission(webhookSecret, {
        transmissionId: id,
        transmissionTime: time,
        raw,
      })
      if (!sig || !signatureMatches(expected, sig)) {
        return json(res, 401, { applied: false, reason: 'signature did not verify' })
      }
    }

    let event: WebhookEvent
    try {
      event = JSON.parse(raw.toString('utf8')) as WebhookEvent
    } catch {
      return json(res, 400, { applied: false, reason: 'unparseable body' })
    }

    if (flags.dedupeEvents && processedEvents.has(event.id)) {
      return json(res, 200, { applied: false, reason: 'event already processed' })
    }
    processedEvents.add(event.id)

    const orderId = event.resource?.custom_id ?? ''
    const order = orders.get(orderId)
    if (!order) return json(res, 404, { applied: false, reason: 'unknown order' })

    // Strictly older only: an event with the same timestamp is a retry, not an out-of-order
    // delivery, and deduplication is the fix for that one.
    if (flags.guardEventOrder && order.lastEventAt && event.create_time < order.lastEventAt) {
      return json(res, 200, { applied: false, reason: 'event older than the last one applied' })
    }
    order.lastEventAt = event.create_time

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      order.status = 'fulfilled'
      order.fulfillmentCount += 1
      return json(res, 200, { applied: true, action: 'fulfilled', orderId })
    }
    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      order.status = 'refunded'
      return json(res, 200, { applied: true, action: 'refunded', orderId })
    }
    if (event.event_type === 'PAYMENT.CAPTURE.DENIED') {
      order.status = 'pending'
      return json(res, 200, { applied: true, action: 'held', orderId })
    }
    return json(res, 200, { applied: false, reason: 'event type not handled' })
  }

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', 'http://fixture.invalid')

        if (req.method === 'GET' && url.pathname === VERIFICATION_PATH) {
          res.writeHead(200, { 'content-type': 'text/plain' })
          return res.end(verificationToken)
        }

        // Stands in for a real checkout: the engine needs an order awaiting payment.
        if (req.method === 'POST' && url.pathname === '/test/orders') {
          const body = JSON.parse((await readRaw(req)).toString('utf8') || '{}') as {
            amountCents?: number
            currency?: string
          }
          sequence += 1
          const suffix = String(sequence).padStart(4, '0')
          const order: FixtureOrder = {
            orderId: `ORD-${suffix}`,
            captureId: `CAP-${suffix}`,
            status: 'pending',
            fulfillmentCount: 0,
            amountCents: body.amountCents ?? 1000,
            currency: body.currency ?? 'USD',
            lastEventAt: '',
          }
          orders.set(order.orderId, order)
          return json(res, 201, order)
        }

        if (req.method === 'POST' && url.pathname === '/webhooks/paypal') {
          return await handleWebhook(req, res)
        }

        // The probe route the engine reads. Secret-protected, exactly like the real one.
        if (req.method === 'GET' && url.pathname.startsWith('/probe/orders/')) {
          if (req.headers['x-shakedown-probe'] !== probeSecret) {
            return json(res, 403, { error: 'bad probe secret' })
          }
          const id = decodeURIComponent(url.pathname.slice('/probe/orders/'.length))
          const order = orders.get(id)
          if (!order) return json(res, 404, { orderId: id, found: false })
          return json(res, 200, { ...order, found: true })
        }

        return json(res, 404, { error: 'not found' })
      } catch (error) {
        return json(res, 500, { error: (error as Error).message })
      }
    })()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture target failed to bind.')
  const origin = `http://127.0.0.1:${address.port}`

  const adapter: TargetAdapter = {
    name: 'fixture',
    origin,

    async openOrder(input): Promise<OpenedOrder> {
      const res = await fetch(`${origin}/test/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountCents: input.amountCents, currency: input.currency ?? 'USD' }),
      })
      const body = (await res.json()) as FixtureOrder
      return {
        orderId: body.orderId,
        captureId: body.captureId,
        amountCents: body.amountCents,
        currency: body.currency,
      }
    },

    async deliverWebhook(event: WebhookEvent, opts?: DeliveryOptions): Promise<DeliveryResult> {
      const raw = JSON.stringify(event)
      const transmissionId = `TR-${event.id}`
      const transmissionTime = new Date().toISOString()
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'paypal-transmission-id': transmissionId,
        'paypal-transmission-time': transmissionTime,
      }
      // An unsigned delivery still carries headers; the proof is what is missing. This is the
      // fixture's own scheme — against a real target the engine cannot mint PayPal's signature,
      // which is precisely why verifying it is the fix.
      headers['paypal-transmission-sig'] =
        opts?.signed === false
          ? 'not-a-valid-signature'
          : signTransmission(webhookSecret, { transmissionId, transmissionTime, raw })

      const res = await fetch(`${origin}/webhooks/paypal`, { method: 'POST', headers, body: raw })
      return { status: res.status, accepted: res.ok, body: await res.text() }
    },

    async probeOrder(orderId: string): Promise<OrderState> {
      const res = await fetch(`${origin}/probe/orders/${encodeURIComponent(orderId)}`, {
        headers: { 'x-shakedown-probe': probeSecret },
      })
      if (!res.ok) {
        return {
          orderId,
          found: false,
          status: 'unknown',
          fulfillmentCount: 0,
          amountCents: 0,
          currency: 'USD',
        }
      }
      const body = (await res.json()) as FixtureOrder
      return {
        orderId: body.orderId,
        found: true,
        status: body.status,
        fulfillmentCount: body.fulfillmentCount,
        amountCents: body.amountCents,
        currency: body.currency,
      }
    },
  }

  return {
    origin,
    adapter,
    flags,
    setFlags(next) {
      Object.assign(flags, next)
    },
    reset() {
      orders.clear()
      processedEvents.clear()
      sequence = 0
    },
    orders: () => [...orders.values()],
    close: () => closeServer(server),
  }
}

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.closeAllConnections?.()
    server.close((error) => (error ? reject(error) : resolve()))
  })
