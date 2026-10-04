import { followRun, jobExists, type LiveEvent } from '../../../../../../lib/console/live'

export const dynamic = 'force-dynamic'

/** A live run as Server-Sent Events: everything so far, then each event as it lands. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!/^CMP-[0-9A-F]{12}$/.test(id) || !(await jobExists(id))) {
    return new Response('No such live run.', { status: 404 })
  }

  const encoder = new TextEncoder()
  const stop = new AbortController()
  let ping: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      const close = () => {
        if (!open) return
        open = false
        clearInterval(ping)
        stop.abort()
        controller.close()
      }
      const send = (event: LiveEvent) => {
        if (open) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      // A comment line now and then keeps proxies from closing a quiet stream.
      ping = setInterval(() => open && controller.enqueue(encoder.encode(': ping\n\n')), 15_000)
      request.signal.addEventListener('abort', close)
      followRun(id, send, stop.signal)
        .catch(() => send({ type: 'failed', reason: 'The run could not be followed.' }))
        .finally(close)
    },
    cancel() {
      clearInterval(ping)
      stop.abort()
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
