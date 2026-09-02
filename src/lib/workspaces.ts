// A run creates no bucket of its own: it reads inputs from the buckets that
// hold them and writes outputs into the buckets it names. Buckets named ws-…
// are system-managed plumbing, so pickers and browsers hide them by default;
// direct routes (provenance/job deep links) keep working because the bucket
// views take the name from the route, not from a listing.
const WORKSPACE_BUCKET_RE = /^ws-/

export function isWorkspaceBucket(name: string): boolean {
  return WORKSPACE_BUCKET_RE.test(name)
}
