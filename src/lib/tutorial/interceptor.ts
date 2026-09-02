// The one opt-in seam the tutorials use: while a session is active the calls
// its surfaces make are answered from fixtures, and no write ever leaves the
// browser. Nothing here imports the API client at run time, so the client can
// consult it safely.
import type { ApiClientOptions, ApiRequestOptions } from '@/lib/api'

/** Answers a call from fixtures, or null for a call the tutorial does not serve. */
export type ApiInterceptor = (
  path: string,
  options: ApiRequestOptions,
  client: ApiClientOptions,
) => Promise<unknown> | null

const READ_METHODS = new Set(['GET', 'HEAD'])

/** A read the tutorial does not serve may still reach the node; a write never does. */
export function passesThrough(options: ApiRequestOptions): boolean {
  return READ_METHODS.has((options.method ?? 'GET').toUpperCase())
}

let interceptor: ApiInterceptor | null = null

/** Installs (or, with null, removes) the answering side of a tutorial session. */
export function setApiInterceptor(next: ApiInterceptor | null) {
  interceptor = next
}

export function apiInterceptor(): ApiInterceptor | null {
  return interceptor
}
