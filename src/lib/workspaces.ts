// A run creates no bucket of its own: it reads inputs from the buckets that
// hold them and writes outputs into the buckets it names. Buckets named ws-…
// are system-managed plumbing, so pickers and browsers hide them by default;
// direct routes (provenance/job deep links) keep working because the bucket
// views take the name from the route, not from a listing.
const WORKSPACE_BUCKET_RE = /^ws-/

export function isWorkspaceBucket(name: string): boolean {
  return WORKSPACE_BUCKET_RE.test(name)
}

// The desktop node offers each linked folder as an internal bucket: folder-<ULID>.
// A ULID's first character is 0-7, since a larger one would overflow 128 bits.
const FOLDER_BUCKET_RE = /^folder-[0-7][0-9a-hjkmnp-tv-z]{25}$/

export function isFolderBucket(name: string): boolean {
  return FOLDER_BUCKET_RE.test(name)
}

export function isHiddenBucket(name: string): boolean {
  return isWorkspaceBucket(name) || isFolderBucket(name)
}
