// Statuses whose responses must not carry a body; the Response constructor
// throws when given one (even a zero-byte buffer) for these.
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

export const RATE_LIMITED_STATUS = 429

// Cap on how long a Retry-After may park a request before we give up and let
// the caller show the rate-limited notice instead of appearing to hang.
const MAX_RETRY_WAIT_MS = 10_000

/**
 * Delay a `Retry-After` header asks for, clamped to `MAX_RETRY_WAIT_MS`.
 * Accepts both header forms (delay-seconds and HTTP-date) and returns null when
 * the header is absent, malformed, or asks for longer than we will wait.
 */
export function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('Retry-After')
  if (!header) return null

  const trimmed = header.trim()
  const seconds = Number(trimmed)
  if (trimmed !== '' && Number.isFinite(seconds)) {
    if (seconds < 0) return null
    return seconds * 1000 <= MAX_RETRY_WAIT_MS ? seconds * 1000 : null
  }

  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return null
  const wait = at - Date.now()
  if (wait <= 0) return 0
  return wait <= MAX_RETRY_WAIT_MS ? wait : null
}

function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    let timer: ReturnType<typeof globalThis.setTimeout>
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(signal?.reason)
    }
    timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

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

/**
 * `fetchWithTimeout` plus one bounded retry when the backend rate limiter
 * answers 429 (api/src/rate_limit.rs, which always sets Retry-After).
 *
 * Only idempotent requests are retried, and only once: a write must never be
 * replayed, and a second 429 means the budget is genuinely exhausted rather
 * than momentarily full. Everything else is handed back for the caller to
 * surface as a rate-limited notice.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  const response = await fetchWithTimeout(input, init, timeoutMs)
  if (response.status !== RATE_LIMITED_STATUS) return response

  const method = (init.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return response

  const wait = retryAfterMs(response)
  if (wait === null) return response

  await delay(wait, init.signal)
  return fetchWithTimeout(input, init, timeoutMs)
}
