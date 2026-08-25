// Typed wrappers over the Aruna Desktop command channel. Loaded lazily, and
// only when isDesktop(): the web build never pulls this chunk. Every wrapper
// below is a command the shell implements; one it does not answer surfaces
// BridgeUnavailable instead of a stubbed value.
import { desktopBridge } from './desktop'
import { setAuthOpener } from '@/composables/useAuth'
import { reportGlobalError } from '@/composables/useGlobalErrors'

/** The shell exposes no such command, or injected no bridge at all. */
export class BridgeUnavailable extends Error {
  constructor(
    readonly command: string,
    detail?: string,
  ) {
    super(detail ?? `Aruna Desktop does not provide "${command}".`)
    this.name = 'BridgeUnavailable'
  }
}

/** The command reached the shell and failed, or answered with a wrong shape. */
export class BridgeFailure extends Error {
  constructor(
    readonly command: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'BridgeFailure'
  }
}

/** Supervisor state of the node the shell embeds. */
export interface NodeStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  nodeId: string | null
  realm: string | null
  enrolled: boolean
  // Base URL of the node's own listener, for the local S3 and REST surfaces.
  apiBaseUrl: string | null
  version: string | null
  uptimeSeconds: number | null
  // Why the supervisor is stopped or in error, in the owner's words.
  message: string | null
}

/** Owner-controlled local settings (aruna notes, decision 10). */
export interface NodeSettings {
  storagePath: string
  offeredDirectories: string[]
  paused: boolean
  autoStart: boolean
}

export interface EnrollPayload {
  secret: string
  // Both are carried by an aruna://enroll link; a pasted bare secret has neither.
  seedUrl?: string
  realm?: string
  label?: string
}

export interface EnrollResult {
  nodeId: string | null
  realm: string | null
}

/**
 * What the shell made of an `aruna://enroll` link; never carries the secret.
 * The retained answer and the live event share this shape.
 */
export interface EnrollInvite {
  seed: string | null
  realm: string | null
  applied: boolean
  error: string | null
}

/** What a realm address turned out to be once the shell reached it. */
export interface RealmTarget {
  origin: string
  realm: string | null
  apiVersion: string | null
  // False when only the API answered: an Aruna node serving no portal.
  portal: boolean
}

const STATES: NodeStatus['state'][] = ['stopped', 'starting', 'running', 'error']

function detail(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : JSON.stringify(err)
}

// Tauri answers an unregistered command with a "not found" style error; that is
// a missing shell half, not a failed call, so it maps to BridgeUnavailable.
function unknownCommand(err: unknown): boolean {
  return /unknown command|not (?:implemented|found)|unimplemented/i.test(detail(err))
}

async function call(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const bridge = desktopBridge()
  if (!bridge) throw new BridgeUnavailable(command)
  try {
    return await bridge.invoke(command, args)
  } catch (err) {
    if (err instanceof BridgeUnavailable || err instanceof BridgeFailure) throw err
    if (unknownCommand(err)) throw new BridgeUnavailable(command, detail(err))
    throw new BridgeFailure(command, detail(err), { cause: err })
  }
}

function asRecord(command: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeFailure(command, `Aruna Desktop answered "${command}" with an unexpected value.`)
  }
  return value as Record<string, unknown>
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Reads an invitation the shell either retained or emitted. */
export function readInvite(payload: unknown): EnrollInvite {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  return {
    seed: asText(raw.seed),
    realm: asText(raw.realm),
    applied: raw.applied === true,
    error: asText(raw.error),
  }
}

function readSettings(command: string, value: unknown): NodeSettings {
  const raw = asRecord(command, value)
  return {
    storagePath: asText(raw.storagePath) ?? '',
    offeredDirectories: asList(raw.offeredDirectories),
    paused: raw.paused === true,
    autoStart: raw.autoStart === true,
  }
}

/** Reads a supervisor status the shell either answered with or pushed. */
export function readStatus(payload: unknown): NodeStatus {
  const raw =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  return {
    state: STATES.find((known) => known === raw.state) ?? 'error',
    nodeId: asText(raw.nodeId),
    realm: asText(raw.realm),
    enrolled: raw.enrolled === true,
    apiBaseUrl: asText(raw.apiBaseUrl),
    version: asText(raw.version),
    uptimeSeconds: asNumber(raw.uptimeSeconds),
    message: asText(raw.message),
  }
}

/** Supervisor status of the embedded node. */
export async function nodeStatus(): Promise<NodeStatus> {
  const command = 'node_status'
  return readStatus(asRecord(command, await call(command)))
}

/** The last `lines` log lines of the embedded node, oldest first. */
export async function nodeLogsTail(lines = 200): Promise<string[]> {
  const command = 'node_logs_tail'
  const answer = await call(command, { lines })
  return Array.isArray(answer) ? asList(answer) : asList(asRecord(command, answer).lines)
}

export async function nodeSettings(): Promise<NodeSettings> {
  const command = 'node_settings_get'
  return readSettings(command, await call(command))
}

/** Applies a settings patch; the shell answers with the settings it stored. */
export async function setNodeSettings(patch: Partial<NodeSettings>): Promise<NodeSettings> {
  const command = 'node_settings_set'
  return readSettings(command, await call(command, { settings: patch }))
}

/** Redeems an enrollment on the embedded node. */
export async function enrollApply(payload: EnrollPayload): Promise<EnrollResult> {
  const command = 'enroll_apply'
  const raw = asRecord(command, await call(command, { ...payload }))
  return { nodeId: asText(raw.nodeId), realm: asText(raw.realm) }
}

/**
 * The enrollment the shell last acted on, kept across windows so a link
 * followed into a cold start is still shown. Null when it holds none.
 */
export async function lastEnrollInvite(): Promise<EnrollInvite | null> {
  const command = 'enroll_invite_last'
  const answer = await call(command)
  return answer == null ? null : readInvite(asRecord(command, answer))
}

/**
 * Checks a realm address and remembers it as this device's realm. Success is a
 * pending reload, not a value to render: the shell replaces the window so the
 * portal boots against that realm's API.
 */
export async function validateRealm(input: string): Promise<RealmTarget> {
  const command = 'validate_realm'
  const raw = asRecord(command, await call(command, { input }))
  return {
    origin: asText(raw.origin) ?? '',
    realm: asText(raw.realm),
    apiVersion: asText(raw.apiVersion),
    portal: raw.portal === true,
  }
}

/**
 * Destroys the local identity and every local replica. `confirm` is the phrase
 * the shell demands back, so a stray call cannot wipe a device.
 */
export async function wipeDevice(confirm: string): Promise<void> {
  await call('wipe_device', { confirm })
}

/** Native folder dialog; null when the owner cancelled it. */
export async function pickDirectory(options: { title?: string; startPath?: string } = {}): Promise<string | null> {
  return asText(await call('pick_directory', { ...options }))
}

/** Hands a URL to the system browser (never the shell's own webview). */
export async function openExternal(url: string): Promise<void> {
  await call('open_external', { url })
}

/**
 * Routes sign-in through the system browser (RFC 8252). Without a bridge the
 * opener stays uninstalled, so beginAuthRedirect falls back to this window.
 */
export function installAuthOpener(): void {
  if (!desktopBridge()) return
  setAuthOpener((url) => {
    void openExternal(url).catch((err) => {
      reportGlobalError(`Aruna Desktop could not open your browser for sign-in: ${detail(err)}`)
    })
  })
}
