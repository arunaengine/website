// Events the shell pushes at the portal. Commands travel the injected bridge,
// but events travel Tauri's own channel, so its API module is imported lazily
// and only inside the shell: the web build never loads that chunk.
import { desktopBridge } from './desktop'
import { readInvite, type EnrollInvite } from './desktopBridge'

const ENROLL_EVENT = 'enroll-invite'

export type Unlisten = () => void

/**
 * Watches for an enrollment the shell acted on, answering null when the shell
 * cannot be listened to. A cold start can deliver the event before the portal
 * subscribes, which is what the retained invitation answers.
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
