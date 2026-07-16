// Runtime configuration served by the hosting node at /portal-config.json.
// Today the backend returns only { "apiBaseUrl": "/api/v1" }; the file is
// forward-extensible, so unknown fields are ignored and missing fields fall
// back to the typed defaults. Later features that lack backend endpoints are
// gated behind `features` flags (off by default).
import { fetchWithTimeout } from './fetch'

export interface PortalRuntimeConfig {
  apiBaseUrl: string
  features: Record<string, boolean>
}

export const DEFAULT_PORTAL_CONFIG: PortalRuntimeConfig = {
  apiBaseUrl: '/api/v1',
  features: {},
}

// Per-flag defaults are layered under the served `features` map, so deployments
// can still explicitly disable a surface. The current backend serves placement
// and durable jobs. Cursor paging and TES remain opt-in because their availability
// depends on a newer search contract and node-local compute configuration.
const DEFAULT_FEATURES: Record<string, boolean> = {
  jobs: true,
  placementAdmin: true,
  searchCursor: false,
  tes: false,
}

let current: PortalRuntimeConfig = { ...DEFAULT_PORTAL_CONFIG, features: { ...DEFAULT_FEATURES } }

export function portalConfig(): PortalRuntimeConfig {
  return current
}

export function featureEnabled(flag: string): boolean {
  return current.features[flag] === true
}

// Never throws: any fetch/parse failure keeps the defaults so the portal
// still boots when the config endpoint is absent (e.g. vite dev server).
export async function loadPortalConfig(): Promise<PortalRuntimeConfig> {
  try {
    const response = await fetchWithTimeout(
      '/portal-config.json',
      { headers: { Accept: 'application/json' } },
      3_000,
    )
    if (!response.ok) return current
    const raw: unknown = await response.json()
    if (raw && typeof raw === 'object') current = mergeConfig(raw as Record<string, unknown>)
  } catch {
    /* keep defaults */
  }
  return current
}

function mergeConfig(raw: Record<string, unknown>): PortalRuntimeConfig {
  const merged: PortalRuntimeConfig = { ...DEFAULT_PORTAL_CONFIG, features: { ...DEFAULT_FEATURES } }
  if (typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl.trim()) merged.apiBaseUrl = raw.apiBaseUrl.trim()
  if (raw.features && typeof raw.features === 'object' && !Array.isArray(raw.features)) {
    for (const [key, value] of Object.entries(raw.features as Record<string, unknown>)) {
      if (typeof value === 'boolean') merged.features[key] = value
    }
  }
  return merged
}
