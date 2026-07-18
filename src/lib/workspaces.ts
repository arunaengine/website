// Per-run workspace buckets. The backend job framework creates one scratch
// bucket per run, named ws-<jobId> (see runCrate.ts workspaceBucket). They are
// system-managed plumbing, so pickers and browsers hide them by default —
// direct routes (provenance/job deep links) keep working because the bucket
// views take the name from the route, not from a listing.
const WORKSPACE_BUCKET_RE = /^ws-/

export function isWorkspaceBucket(name: string): boolean {
  return WORKSPACE_BUCKET_RE.test(name)
}

// Job submission workspace choice (agreed portal↔backend contract). `temporary`
// workspaces are deleted after a successful run, `kept` ones stay as ws-<jobId>,
// `existing` reuses a caller-chosen bucket.
export type WorkspaceMode = 'temporary' | 'kept' | 'existing'

export interface WorkspaceChoice {
  mode: WorkspaceMode
  bucket?: string
}
