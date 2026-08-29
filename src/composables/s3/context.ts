// When the temporary S3 session for a group and node opens on its own. Shared
// by the Data view and the dialog browser so both surfaces behave the same.

/** Identifies one session pair, so a failed open is recognised again. */
export function contextKey(nodeId: string | null, groupId: string): string {
  return `${nodeId ?? ''}|${groupId}`
}

/**
 * Whether the session for the selected group and node has to be opened now.
 * A pair that did not become ready is never opened again automatically, so a
 * failure ends in a Retry button instead of a retry loop; another group or
 * node is a new pair and opens on its own.
 */
export function shouldOpenContext(state: {
  signedIn: boolean
  groupId: string
  nodeId: string | null
  ready: boolean
  busy: boolean
  failedKey: string | null
}): boolean {
  if (!state.signedIn || !state.groupId || !state.nodeId) return false
  if (state.ready || state.busy) return false
  return state.failedKey !== contextKey(state.nodeId, state.groupId)
}
