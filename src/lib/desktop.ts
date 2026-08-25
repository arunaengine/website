// Desktop context injected by the Aruna Desktop shell. One portal build serves
// both uses: the shell defines `window.__ARUNA_DESKTOP__` before the bundle
// runs, and its absence is plain web behaviour. The shell never replaces this
// window: it reports every later context, so the context lives in a ref and
// the portal follows it (aruna notes, decision 20).
import { shallowRef } from 'vue'
import { applyPortalConfig, DEFAULT_PORTAL_CONFIG, loadPortalConfig } from './config'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import type { Unlisten } from './desktopEvents'

/**
 * Command channel into the shell. `version` pins the command set the shell
 * implements; a wrapper the shell does not answer surfaces BridgeUnavailable,
 * which is how an older shell degrades rather than breaks.
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
  // The realm this device remembers; present whenever the shell stores one.
  realmUrl?: string
  features?: DesktopFeatures
  bridge?: DesktopBridge
}

declare global {
  interface Window {
    __ARUNA_DESKTOP__?: unknown
  }
}

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
  const realm = trimmed(source.realmUrl)
  if (realm) context.realmUrl = realm
  const features = readFeatures(source.features)
  if (features) context.features = features
  const bridge = readBridge(source.bridge)
  if (bridge) context.bridge = bridge
  return context
}

/** The live shell context; null on the web. Replaced whole on every change. */
export const shellContext = shallowRef<DesktopContext | null>(
  typeof window === 'undefined' ? null : readContext(window.__ARUNA_DESKTOP__),
)

/** The context the shell reported last, or null on the web. */
export function desktopContext(): DesktopContext | null {
  return shellContext.value
}

/** True inside the Aruna Desktop shell; the guard for every desktop-only path. */
export function isDesktop(): boolean {
  return desktopContext() !== null
}

/** The shell's command channel, or null when it injected none. */
export function desktopBridge(): DesktopBridge | null {
  return desktopContext()?.bridge ?? null
}

function installConfig(context: DesktopContext): void {
  applyPortalConfig({
    apiBaseUrl: context.apiBaseUrl,
    authCallbackOrigin: context.authCallbackOrigin ?? '',
    // The shell may switch system-browser auth off, but never the desktop flag.
    features: { systemBrowserAuth: true, ...context.features, desktop: true },
  })
}

// What the portal actually follows; the bridge is out because the shell keeps
// handing back the one it injected.
function signature(context: DesktopContext): string {
  return JSON.stringify([
    context.apiBaseUrl,
    context.authCallbackOrigin ?? '',
    context.realmUrl ?? '',
    context.features ?? {},
  ])
}

/**
 * Installs a context the shell reported. A changed API base is switched in
 * place: the caches that belong to the old base are dropped and the session is
 * re-bootstrapped against the new one, keeping the realm-issued token, which
 * the local node accepts too. Requests still in flight are ignored by the
 * session epoch useAruna bumps.
 */
export async function applyShellContext(next: unknown): Promise<void> {
  const current = shellContext.value
  const parsed = readContext(next)
  if (!current || !parsed) return
  const merged: DesktopContext = { ...parsed, ...(current.bridge ? { bridge: current.bridge } : {}) }
  if (signature(merged) === signature(current)) return
  const switched = merged.apiBaseUrl !== current.apiBaseUrl
  installConfig(merged)
  const aruna = switched ? (await import('@/composables/useAruna')).useAruna() : null
  if (aruna) {
    aruna.setApiBaseUrl(merged.apiBaseUrl, { keepToken: true })
    const { resetDeviceQueries } = await import('@/composables/useDeviceQuery')
    resetDeviceQueries()
  }
  shellContext.value = merged
  if (!aruna) return
  // The old verdict was about the old base, so the new one is probed again.
  const { probeRealm } = await import('./desktopBoot')
  void probeRealm()
  await aruna.refresh()
}

/** Asks the shell for its context; a shell without that command is no failure. */
export async function refreshShellContext(): Promise<void> {
  if (!desktopBridge()) return
  try {
    const { shellContext: current } = await import('./desktopBridge')
    await applyShellContext(await current())
  } catch {
    // BridgeUnavailable: an older shell reports its context by event alone.
  }
}

/**
 * Follows the shell's context for the life of the window: the event carries
 * every change, and the one command answers what changed before this listener
 * was installed.
 */
export async function followShellContext(): Promise<Unlisten | null> {
  if (!desktopBridge()) return null
  const { onShellContext } = await import('./desktopEvents')
  const off = await onShellContext((context) => void applyShellContext(context))
  await refreshShellContext()
  return off
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
  installConfig(context)
  try {
    const bridge = await import('./desktopBridge')
    bridge.installAuthOpener()
  } catch {
    reportGlobalError('Aruna Desktop features could not be loaded, please restart the app.')
  }
  void followShellContext()
}
