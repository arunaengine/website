import { useS3 } from '@/composables/useS3'

// Fetch one profile artifact (or a pasted document itself) as text. A URL that
// resolves to a bucket on one of this realm's nodes is read through an
// authenticated GetObject, the same signed path the profiles view uses, so it
// works even when the object is not anonymously public or its bucket predates
// the public-read CORS rule. Anything else is a genuinely external host,
// fetched directly by the browser (and subject to that host's CORS policy).
// Shared by ImportProfileSection and the ProfileBasicsStep SHACL attach block.
export function useArtifactFetch() {
  const s3 = useS3()

  async function fetchArtifactText(target: string): Promise<string> {
    const object = s3.hasActiveKey.value ? s3.resolveObjectUrl(target) : null
    if (object) return s3.getObjectText(object.bucket, object.key, object.nodeId)
    const response = await fetch(target)
    if (!response.ok) throw new Error(`Fetch failed (${response.status} ${response.statusText}).`)
    return response.text()
  }

  return { fetchArtifactText }
}
