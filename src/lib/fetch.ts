// Statuses whose responses must not carry a body; the Response constructor
// throws when given one (even a zero-byte buffer) for these.
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const callerSignal = init.signal
  const forwardAbort = () => controller.abort(callerSignal?.reason)

  if (callerSignal?.aborted) forwardAbort()
  else callerSignal?.addEventListener('abort', forwardAbort, { once: true })

  const timeout = globalThis.setTimeout(
    () => controller.abort(new DOMException('Request timed out.', 'TimeoutError')),
    timeoutMs,
  )
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    // Buffer the body inside the timeout window. Some servers expose a body
    // stream even on empty responses (e.g. a DELETE answered with 204 plus
    // Content-Length: 0); reconstructing such a Response with a non-null body
    // throws, so empty buffers and null-body statuses degrade to null.
    const buffer = response.body ? await response.arrayBuffer() : null
    const body = buffer && buffer.byteLength > 0 && !NULL_BODY_STATUSES.has(response.status) ? buffer : null
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } finally {
    globalThis.clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', forwardAbort)
  }
}
