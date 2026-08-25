// Events the shell pushes at the portal. Commands travel the injected bridge,
// but events travel Tauri's own channel, so its API module is imported lazily
// and only inside the shell: the web build never loads that chunk.
import { desktopBridge } from './desktop'
import { readInvite, readStatus, type EnrollInvite, type NodeStatus } from './desktopBridge'

const ENROLL_EVENT = 'enroll-invite'
const STATUS_EVENT = 'node-status'
const CONTEXT_EVENT = 'context-changed'
const NAVIGATE_EVENT = 'navigate'

export type Unlisten = () => void

async function subscribe(event: string, handler: (payload: unknown) => void): Promise<Unlisten | null> {
  if (!desktopBridge()) return null
  try {
    const { listen } = await import('@tauri-apps/api/event')
    return await listen(event, (message) => handler(message.payload))
  } catch {
    return null
  }
}

/**
 * Watches the supervisor state of the embedded node. Answers null when the
 * shell cannot be listened to, which leaves the caller on its own polling.
 */
export function onNodeStatus(handler: (status: NodeStatus) => void): Promise<Unlisten | null> {
  return subscribe(STATUS_EVENT, (payload) => handler(readStatus(payload)))
}

/**
 * Watches the shell's own context: the API base, the callback origin and the
 * realm this device remembers. The payload is left raw for the context reader;
 * a shell that cannot be listened to leaves the portal on what it was given.
 */
export function onShellContext(handler: (context: unknown) => void): Promise<Unlisten | null> {
  return subscribe(CONTEXT_EVENT, handler)
}

/**
 * Watches where the shell wants this window: a deep link it followed arrives
 * as a portal-relative path, never as a reload. Anything else is dropped, so
 * no event can send the window at a foreign origin.
 */
export function onShellNavigate(handler: (path: string) => void): Promise<Unlisten | null> {
  return subscribe(NAVIGATE_EVENT, (payload) => {
    const raw = payload && typeof payload === 'object' ? (payload as { path?: unknown }).path : payload
    if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) handler(raw)
  })
}

/**
 * Watches for an enrollment the shell acted on, answering null when the shell
 * cannot be listened to. A cold start can deliver the event before the portal
 * subscribes, which is what the retained invitation answers.
 */
export function onEnrollInvite(handler: (invite: EnrollInvite) => void): Promise<Unlisten | null> {
  return subscribe(ENROLL_EVENT, (payload) => handler(readInvite(payload)))
}
