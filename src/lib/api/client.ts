import { portalConfig } from '../config'
import { RATE_LIMITED_STATUS, fetchWithRetry } from '../fetch'
import { errorMessage } from '../utils'

const DEFAULT_API_BASE_URL = '/api/v1'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable backend code, e.g. `rate_limited`. */
    public code?: string,
    /** Parsed structured backend error body. */
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** True when the backend rate limiter rejected the request. */
export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === RATE_LIMITED_STATUS
}

// A node that is not a management node relays management-only routes to one;
// these codes mean no management node answered.
const RELAY_FAILURE_CODES = ['no_management_node', 'relay_failed']

export const NO_MANAGEMENT_NODE_MESSAGE =
  'No management node is reachable right now, the node that keeps the realm settings this needs. Try again later.'

/** True when a management-only call found no management node to serve it. */
export function isNoManagementNode(error: unknown): boolean {
  return error instanceof ApiError && RELAY_FAILURE_CODES.includes(error.code ?? '')
}

/** Message to show for a failed request. */
export function apiErrorMessage(error: unknown): string {
  if (isNoManagementNode(error)) return NO_MANAGEMENT_NODE_MESSAGE
  return errorMessage(error)
}

function rateLimitMessage(response: Response): string {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0
    ? `Too many requests. Please try again in ${Math.ceil(seconds)}s.`
    : 'Too many requests. Please try again in a moment.'
}

export interface ApiClientOptions {
  baseUrl?: string
  token?: string
}

export interface ApiRequestOptions extends RequestInit {
  token?: string
  query?: Record<string, string | number | boolean | null | undefined>
}

export function defaultApiBaseUrl(): string {
  // The build-time env pin wins over runtime config so existing deployments
  // keep their behaviour; the localStorage override in useAruna wins over both.
  return import.meta.env.VITE_ARUNA_API_BASE_URL || portalConfig().apiBaseUrl || DEFAULT_API_BASE_URL
}

// Origin the API base points at. The base is absolute when the node serves the
// portal on its own listener, and relative when portal and API share an origin.
export function apiOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl, window.location.origin).origin
  } catch {
    return window.location.origin
  }
}

// Absolute URL of an API path, so callers that need the raw Response (range
// downloads, ETag reads) build the same URL apiRequest would.
export function apiUrl(
  path: string,
  query: ApiRequestOptions['query'] = {},
  client: ApiClientOptions = {},
): URL {
  const baseUrl = (client.baseUrl || defaultApiBaseUrl()).replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${baseUrl}${normalizedPath}`, window.location.origin)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
  client: ApiClientOptions = {},
): Promise<T> {
  const url = apiUrl(path, options.query, client)

  const headers = new Headers(options.headers)
  const token = options.token ?? client.token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchWithRetry(url, { ...options, headers }, DEFAULT_REQUEST_TIMEOUT_MS)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    let code: string | undefined
    let details: Record<string, unknown> | undefined
    try {
      const body = await response.json() as Record<string, unknown>
      details = body
      // `msg` is the GA4GH TES error shape (api/src/routes/tes.rs).
      const bodyMessage = body.message || body.error || body.msg
      if (typeof bodyMessage === 'string') message = bodyMessage
      code = typeof body.code === 'string' ? body.code : undefined
    } catch {
      // Keep the HTTP status message if the body is not JSON.
    }
    // A 429 has already survived the one retry fetchWithRetry allows, so tell
    // the user to wait rather than repeating the limiter's terse wording.
    if (response.status === RATE_LIMITED_STATUS) {
      message = rateLimitMessage(response)
      code = code ?? 'rate_limited'
    }
    throw new ApiError(response.status, message, code, details)
  }

  if (response.status === 204 || response.status === 205) return undefined as T
  const body = await response.text()
  if (!body) return undefined as T
  return JSON.parse(body) as T
}
