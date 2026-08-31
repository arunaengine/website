// The node serves its OpenAPI document at the origin root, not under /api/v1.
const SPEC_PATH = '/api-docs/openapi.json'

/** Derive the spec URL from the portal's API base: origin root + /api-docs. */
export function apiSpecUrl(apiBase: string): string {
  const base = apiBase.trim()
  if (/^https?:\/\//i.test(base)) {
    try {
      return new URL(SPEC_PATH, base).toString()
    } catch {
      return SPEC_PATH
    }
  }
  return SPEC_PATH
}
