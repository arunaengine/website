import { fetchUrlText } from '@/composables/useS3'

// Fetch one profile artifact (or a pasted document itself) as text through the
// shared, authenticated-when-possible resolver in useS3 (see fetchUrlText there
// for the resolution rules: portal-owned buckets and DRS ids go through the node,
// genuinely external hosts are fetched directly and subject to their own CORS).
// Shared by ImportProfileSection and the ProfileBasicsStep SHACL attach block.
export function useArtifactFetch() {
  return { fetchArtifactText: fetchUrlText }
}
