// Events the shell pushes at the portal. Commands travel the injected bridge,
// but events travel Tauri's own channel, so its API module is imported lazily
// and only inside the shell: the web build never loads that chunk.
import { desktopBridge } from './desktop'

const ENROLL_EVENT = 'enroll-invite'

/** What the shell made of an `aruna://enroll` link; never carries the secret. */
export interface EnrollInvite {
  seed: string | null
  realm: string | null
  applied: boolean
  error: string | null
}

export type Unlisten = () => void

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readInvite(payload: unknown): EnrollInvite {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  return {
    seed: text(raw.seed),
    realm: text(raw.realm),
    applied: raw.applied === true,
    error: text(raw.error),
  }
}

/**
 * Watches for an enrollment the shell acted on, answering null when the shell
 * cannot be listened to. A hint, not the authority: a cold start can deliver
 * the event before the portal subscribes, so the node's status decides.
 */
export async function onEnrollInvite(handler: (invite: EnrollInvite) => void): Promise<Unlisten | null> {
  if (!desktopBridge()) return null
  try {
    const { listen } = await import('@tauri-apps/api/event')
    return await listen(ENROLL_EVENT, (event) => handler(readInvite(event.payload)))
  } catch {
    return null
  }
}
