// Release files of database buckets.

/** The default key of a release file: `release-<label>.json` with the label made path safe. */
export function releaseKey(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '')
  return slug ? `release-${slug}.json` : ''
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** When a version was written: its id is a ULID, whose first ten characters are the time; null otherwise. */
export function versionTime(versionId: string): Date | null {
  const head = versionId.trim().toUpperCase().slice(0, 10)
  if (head.length !== 10) return null
  let ms = 0
  for (const char of head) {
    const value = CROCKFORD.indexOf(char)
    if (value < 0) return null
    ms = ms * 32 + value
  }
  return new Date(ms)
}
