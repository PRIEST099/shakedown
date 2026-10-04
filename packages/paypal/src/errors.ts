/** A PayPal API error. Carries PayPal's own fields; never request headers or credentials. */
export class PayPalApiError extends Error {
  readonly status: number
  /** PayPal's error name, e.g. UNPROCESSABLE_ENTITY. */
  readonly errorName?: string
  /** The first detail issue, e.g. INSTRUMENT_DECLINED. */
  readonly issue?: string
  readonly debugId?: string
  readonly details: readonly { issue?: string; description?: string; field?: string }[]

  constructor(init: {
    status: number
    message: string
    errorName?: string
    issue?: string
    debugId?: string
    details?: readonly { issue?: string; description?: string; field?: string }[]
  }) {
    super(init.message)
    this.name = 'PayPalApiError'
    this.status = init.status
    this.errorName = init.errorName
    this.issue = init.issue
    this.debugId = init.debugId
    this.details = init.details ?? []
  }

  /**
   * Recognise the error by its shape as well as its class. A bundler that loads this module
   * twice (a dev server after a hot reload, say) makes two classes, and a plain instanceof
   * check would then treat PayPal's "already captured" as some unknown failure.
   */
  static [Symbol.hasInstance](value: unknown): value is PayPalApiError {
    return (
      value instanceof Error &&
      value.name === 'PayPalApiError' &&
      typeof (value as { status?: unknown }).status === 'number'
    )
  }

  static async fromResponse(res: Response): Promise<PayPalApiError> {
    const debugId = res.headers.get('paypal-debug-id') ?? undefined
    let body: Record<string, unknown> = {}
    try {
      body = (await res.json()) as Record<string, unknown>
    } catch {
      // Non-JSON error body: fall back to the status line.
    }
    const details = Array.isArray(body.details)
      ? (body.details as { issue?: string; description?: string; field?: string }[])
      : []
    const errorName =
      typeof body.name === 'string'
        ? body.name
        : typeof body.error === 'string'
          ? body.error
          : undefined
    const message =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error_description === 'string' && body.error_description) ||
      `PayPal request failed with HTTP ${res.status}`
    return new PayPalApiError({
      status: res.status,
      message,
      errorName,
      issue: details[0]?.issue,
      debugId: typeof body.debug_id === 'string' ? body.debug_id : debugId,
      details,
    })
  }
}
