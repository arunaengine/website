// The app and the realm must run the same Aruna version. When they differ the
// shell does not start the node, and the owner sees one screen about it.

/** Where new builds of Aruna Desktop are published; there is no updater yet. */
export const DESKTOP_RELEASES_URL = 'https://github.com/arunaengine/aruna-desktop/releases'

function numbers(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map(Number)
}

/** Which side runs the newer version, or 'unknown' when the strings do not compare. */
export function versionGap(local: string, realm: string): 'realm-newer' | 'realm-older' | 'unknown' {
  const one = numbers(local)
  const other = numbers(realm)
  if (!one.length || !other.length) return 'unknown'
  for (let index = 0; index < Math.max(one.length, other.length); index += 1) {
    const mine = one[index] ?? 0
    const theirs = other[index] ?? 0
    if (mine !== theirs) return theirs > mine ? 'realm-newer' : 'realm-older'
  }
  return 'unknown'
}

/** "alpha.133" out of "3.0.0-alpha.133"; the whole string without a pre-release tag. */
export function releaseName(version: string): string {
  const tag = version.match(/-(.+)$/)
  return tag?.[1] ?? version
}
