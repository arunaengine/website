// Runtime configuration served by the hosting node at /portal-config.json.
// Today the backend returns only { "apiBaseUrl": "/api/v1" }; the file is
// forward-extensible, so unknown fields are ignored and missing fields fall
// back to the typed defaults. Optional surfaces can be switched off per
// deployment via the `features` map.
import { fetchWithTimeout } from './fetch'

export interface TerminologyConfig {
  // Base URL of the TS4NFDI federated terminology gateway (no trailing slash).
  gatewayUrl: string
}

export interface PortalRuntimeConfig {
  apiBaseUrl: string
  features: Record<string, boolean>
  terminology: TerminologyConfig
}

export const DEFAULT_PORTAL_CONFIG: PortalRuntimeConfig = {
  apiBaseUrl: '/api/v1',
  features: {},
  terminology: { gatewayUrl: 'https://terminology.services.base4nfdi.de/api-gateway' },
}

// Per-flag defaults are layered under the served `features` map, so deployments
// can still explicitly disable a surface. The backend serves placement, durable
// jobs, cursor-paged search and the GA4GH TES facade; the Compute surface
// degrades to an honest panel on nodes without a compute backend.
const DEFAULT_FEATURES: Record<string, boolean> = {
  jobs: true,
  placementAdmin: true,
  policies: true,
  searchCursor: true,
  stagingJobs: true,
  tes: true,
}

let current: PortalRuntimeConfig = {
  ...DEFAULT_PORTAL_CONFIG,
  features: { ...DEFAULT_FEATURES },
  terminology: { ...DEFAULT_PORTAL_CONFIG.terminology },
}

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
  const merged: PortalRuntimeConfig = {
    ...DEFAULT_PORTAL_CONFIG,
    features: { ...DEFAULT_FEATURES },
    terminology: { ...DEFAULT_PORTAL_CONFIG.terminology },
  }
  if (typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl.trim()) merged.apiBaseUrl = raw.apiBaseUrl.trim()
  if (raw.features && typeof raw.features === 'object' && !Array.isArray(raw.features)) {
    for (const [key, value] of Object.entries(raw.features as Record<string, unknown>)) {
      if (typeof value === 'boolean') merged.features[key] = value
    }
  }
  if (raw.terminology && typeof raw.terminology === 'object' && !Array.isArray(raw.terminology)) {
    const terminology = raw.terminology as Record<string, unknown>
    if (typeof terminology.gatewayUrl === 'string' && terminology.gatewayUrl.trim()) {
      merged.terminology.gatewayUrl = terminology.gatewayUrl.trim().replace(/\/+$/, '')
    }
  }
  return merged
}
