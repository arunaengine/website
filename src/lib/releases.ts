// Release files of database buckets.

/** The default key of a release file: `release-<label>.json` with the label made path safe. */
export function releaseKey(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '')
  return slug ? `release-${slug}.json` : ''
}
