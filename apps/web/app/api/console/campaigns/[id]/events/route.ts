import { followRun, jobExists, type LiveEvent } from '../../../../../../lib/console/live'

export const dynamic = 'force-dynamic'

/** Each open stream reads the log twice a second; this many at once is plenty for a demo. */
const MAX_STREAMS = 100
const watching = globalThis as unknown as { __shakedownStreams?: number }

/** A live run as Server-Sent Events: everything so far, then each event as it lands. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!/^CMP-[0-9A-F]{12}$/.test(id) || !(await jobExists(id))) {
    return new Response('No such live run.', { status: 404 })
  }
  if ((watching.__shakedownStreams ?? 0) >= MAX_STREAMS) {
    return new Response('Too many people are watching runs. Try again in a minute.', {
      status: 503,
    })
  }
  watching.__shakedownStreams = (watching.__shakedownStreams ?? 0) + 1
  let counted = true
  const release = () => {
    if (!counted) return
    counted = false
    watching.__shakedownStreams = Math.max(0, (watching.__shakedownStreams ?? 1) - 1)
  }

  const encoder = new TextEncoder()
  const stop = new AbortController()
  let ping: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let live = true
      const close = () => {
        if (!live) return
        live = false
        clearInterval(ping)
        stop.abort()
        release()
        controller.close()
      }
      const send = (event: LiveEvent) => {
        if (live) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      // A comment line now and then keeps proxies from closing a quiet stream.
      ping = setInterval(() => live && controller.enqueue(encoder.encode(': ping\n\n')), 15_000)
      request.signal.addEventListener('abort', close)
      followRun(id, send, stop.signal)
        .catch(() => send({ type: 'failed', reason: 'The run could not be followed.' }))
        .finally(close)
    },
    cancel() {
      clearInterval(ping)
      stop.abort()
      release()
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
