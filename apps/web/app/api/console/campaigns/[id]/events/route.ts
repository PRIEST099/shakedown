import { followCampaign, getLiveCampaign, type LiveEvent } from '../../../../../../lib/console/live'

export const dynamic = 'force-dynamic'

/** A live campaign as Server-Sent Events: everything so far, then each event as it happens. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const campaign = getLiveCampaign(id)
  if (!campaign) return new Response('No such live campaign.', { status: 404 })

  const encoder = new TextEncoder()
  let stop = () => {}
  let ping: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      const close = () => {
        if (!open) return
        open = false
        clearInterval(ping)
        stop()
        controller.close()
      }
      const send = (event: LiveEvent) => {
        if (!open) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        if (event.type === 'stored' || event.type === 'failed') close()
      }
      stop = followCampaign(campaign, send)
      // A comment line now and then keeps proxies from closing a quiet stream.
      ping = setInterval(() => open && controller.enqueue(encoder.encode(': ping\n\n')), 15_000)
      request.signal.addEventListener('abort', close)
    },
    cancel() {
      clearInterval(ping)
      stop()
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
