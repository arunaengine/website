// Runtime configuration served by the hosting node at /portal-config.json.
// `apiBaseUrl` is same-origin ("/api/v1") when one listener serves both, and an
// absolute URL when the node serves the portal on a listener of its own. The
// file is forward-extensible, so unknown fields are ignored and missing fields
// fall back to the typed defaults. Optional surfaces can be switched off per
// deployment via the `features` map.
import { fetchWithTimeout } from './fetch'

export interface TerminologyConfig {
  // Base URL of the TS4NFDI federated terminology gateway (no trailing slash).
  gatewayUrl: string
}

/** One row of the login chooser; an option without params is the realm's plain sign-in. */
export interface LoginOption {
  name: string
  description: string
  logo: string
  // A copy for light backgrounds when the logo is drawn in white.
  logoLight?: string
  // Extra authorization request parameters, such as Keycloak's kc_idp_hint.
  params: Record<string, string>
  // Parameters that link this login to the signed-in account; empty means not linkable.
  linkParams: Record<string, string>
  // Signs in at a realm OIDC provider through its login bridge instead of the first provider.
  upstream?: UpstreamLogin
}

/** The `provider` id of a realm OIDC provider and the `bridge` base URL that serves its login. */
export interface UpstreamLogin {
  provider: string
  bridge: string
}

export interface LoginConfig {
  // Empty shows only the realm's plain sign-in.
  options: LoginOption[]
  // Identity provider page that lists and removes linked logins; empty hides the link.
  accountUrl: string
}

export interface PortalRuntimeConfig {
  apiBaseUrl: string
  // Origin the OIDC redirect_uri is built on; empty means this page's origin.
  // A desktop shell serves the portal from a fixed loopback origin (RFC 8252).
  authCallbackOrigin: string
  features: Record<string, boolean>
  terminology: TerminologyConfig
  // Realm registry the realm picker lists; empty means no registry list.
  registryUrl: string
  login: LoginConfig
}

export const DEFAULT_PORTAL_CONFIG: PortalRuntimeConfig = {
  apiBaseUrl: '/api/v1',
  authCallbackOrigin: '',
  features: {},
  terminology: { gatewayUrl: 'https://terminology.services.base4nfdi.de/api-gateway' },
  registryUrl: '',
  login: { options: [], accountUrl: '' },
}

// Per-flag defaults are layered under the served `features` map, so deployments
// can still explicitly disable a surface. The backend serves placement, durable
// jobs, cursor-paged search and the GA4GH TES facade; the Compute surface
// degrades to an honest panel on nodes without a compute backend. Flags absent
// here default to off, which is how 'systemBrowserAuth' stays a desktop opt-in.
const DEFAULT_FEATURES: Record<string, boolean> = {
  jobs: true,
  joinRequests: true,
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
    if (raw && typeof raw === 'object') applyPortalConfig(raw as Record<string, unknown>)
  } catch {
    /* keep defaults */
  }
  return current
}

/** Installs a config document: the served file, or a desktop shell's context. */
export function applyPortalConfig(raw: Record<string, unknown>): PortalRuntimeConfig {
  current = mergeConfig(raw)
  return current
}

function mergeConfig(raw: Record<string, unknown>): PortalRuntimeConfig {
  const merged: PortalRuntimeConfig = {
    ...DEFAULT_PORTAL_CONFIG,
    features: { ...DEFAULT_FEATURES },
    terminology: { ...DEFAULT_PORTAL_CONFIG.terminology },
  }
  if (typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl.trim()) merged.apiBaseUrl = raw.apiBaseUrl.trim()
  if (typeof raw.authCallbackOrigin === 'string' && raw.authCallbackOrigin.trim()) {
    merged.authCallbackOrigin = raw.authCallbackOrigin.trim().replace(/\/+$/, '')
  }
  if (typeof raw.registryUrl === 'string') merged.registryUrl = raw.registryUrl.trim()
  merged.login = loginConfig(raw.login)
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

function stringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

// Both fields or none: an option with only one keeps the plain sign-in.
function upstreamLogin(option: Record<string, unknown>): UpstreamLogin | undefined {
  const provider = typeof option.provider === 'string' ? option.provider.trim() : ''
  const bridge = typeof option.bridge === 'string' ? option.bridge.trim().replace(/\/+$/, '') : ''
  return provider && bridge ? { provider, bridge } : undefined
}

function loginConfig(raw: unknown): LoginConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { options: [], accountUrl: '' }
  const login = raw as Record<string, unknown>
  const options = (Array.isArray(login.options) ? login.options : []).flatMap((entry): LoginOption[] => {
    if (!entry || typeof entry !== 'object') return []
    const option = entry as Record<string, unknown>
    if (typeof option.name !== 'string' || !option.name.trim()) return []
    return [
      {
        name: option.name.trim(),
        description: typeof option.description === 'string' ? option.description : '',
        logo: typeof option.logo === 'string' ? option.logo : '',
        logoLight: typeof option.logoLight === 'string' && option.logoLight ? option.logoLight : undefined,
        params: stringMap(option.params),
        linkParams: stringMap(option.linkParams),
        upstream: upstreamLogin(option),
      },
    ]
  })
  return { options, accountUrl: typeof login.accountUrl === 'string' ? login.accountUrl.trim() : '' }
}
