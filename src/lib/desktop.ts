// Desktop context injected by the Aruna Desktop shell. One portal build serves
// both uses: the shell defines `window.__ARUNA_DESKTOP__` before the bundle
// runs, and its absence is plain web behaviour. The object is read once, on
// first use, so every module sees the same snapshot.
import { applyPortalConfig, DEFAULT_PORTAL_CONFIG, loadPortalConfig } from './config'

/**
 * Command channel into the shell. `version` pins the command set the shell
 * implements; a wrapper the shell does not answer surfaces BridgeUnavailable.
 */
export interface DesktopBridge {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
  version: number
}

/** Runtime switches; unknown flags are passed through to the feature map. */
export interface DesktopFeatures {
  desktop?: boolean
  systemBrowserAuth?: boolean
  [flag: string]: boolean | undefined
}

export interface DesktopContext {
  // API base the shell wants the portal to talk to, absolute or same-origin.
  apiBaseUrl: string
  // Origin of the registered OIDC redirect_uri (RFC 8252 loopback listener).
  authCallbackOrigin?: string
  features?: DesktopFeatures
  bridge?: DesktopBridge
}

declare global {
  interface Window {
    __ARUNA_DESKTOP__?: unknown
  }
}

let snapshot: DesktopContext | null | undefined

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFeatures(value: unknown): DesktopFeatures | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const features: DesktopFeatures = {}
  for (const [flag, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (typeof enabled === 'boolean') features[flag] = enabled
  }
  return features
}

function readBridge(value: unknown): DesktopBridge | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<DesktopBridge>
  if (typeof candidate.invoke !== 'function' || typeof candidate.version !== 'number') return undefined
  return { invoke: candidate.invoke.bind(value), version: candidate.version }
}

// A malformed global is treated as absent: the portal then behaves exactly as
// it does on the web rather than half-entering desktop mode.
function readContext(value: unknown): DesktopContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const context: DesktopContext = {
    apiBaseUrl: trimmed(source.apiBaseUrl) || DEFAULT_PORTAL_CONFIG.apiBaseUrl,
  }
  const origin = trimmed(source.authCallbackOrigin)
  if (origin) context.authCallbackOrigin = origin.replace(/\/+$/, '')
  const features = readFeatures(source.features)
  if (features) context.features = features
  const bridge = readBridge(source.bridge)
  if (bridge) context.bridge = bridge
  return context
}

/** The injected context, or null on the web. Read once and cached. */
export function desktopContext(): DesktopContext | null {
  if (snapshot === undefined) {
    snapshot = typeof window === 'undefined' ? null : readContext(window.__ARUNA_DESKTOP__)
  }
  return snapshot
}

/** True inside the Aruna Desktop shell; the guard for every desktop-only path. */
export function isDesktop(): boolean {
  return desktopContext() !== null
}

/** The shell's command channel, or null when it injected none. */
export function desktopBridge(): DesktopBridge | null {
  return desktopContext()?.bridge ?? null
}

/**
 * Boot-time runtime configuration. The injected context wins over the served
 * /portal-config.json, which is skipped entirely in desktop mode: the shell's
 * app origin serves no such file, so fetching it would only 404.
 */
export async function bootRuntimeConfig(): Promise<void> {
  const context = desktopContext()
  if (!context) {
    await loadPortalConfig()
    return
  }
  applyPortalConfig({
    apiBaseUrl: context.apiBaseUrl,
    authCallbackOrigin: context.authCallbackOrigin ?? '',
    // The shell may switch system-browser auth off, but never the desktop flag.
    features: { systemBrowserAuth: true, ...context.features, desktop: true },
  })
}
