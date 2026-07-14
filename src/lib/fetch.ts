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
    const body = response.body ? await response.arrayBuffer() : null
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
