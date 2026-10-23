// The app and the realm must run the same Aruna version. When they differ the
// shell does not start the node, and the owner sees one screen about it.

/** Where to get a new build of Aruna Desktop; null until there is a public download. */
export const DESKTOP_DOWNLOAD_URL: string | null = null

/** What to tell the owner while there is no public download. */
export const DESKTOP_DOWNLOAD_HELP = 'Get the latest Aruna Desktop from your Aruna administrator.'

type Gap = 'realm-newer' | 'realm-older' | 'unknown'

interface Semver {
  core: number[]
  pre: string[]
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parse(version: string): Semver | null {
  const found = SEMVER.exec(version.trim())
  if (!found) return null
  return { core: [Number(found[1]), Number(found[2]), Number(found[3])], pre: found[4] ? found[4].split('.') : [] }
}

function compareIdentifier(one: string, other: string): number {
  const first = /^\d+$/.test(one)
  const second = /^\d+$/.test(other)
  if (first && second) return Math.sign(Number(one) - Number(other))
  if (first !== second) return first ? -1 : 1
  return one < other ? -1 : one > other ? 1 : 0
}

function compare(one: Semver, other: Semver): number {
  for (let index = 0; index < 3; index += 1) {
    const diff = Math.sign(one.core[index]! - other.core[index]!)
    if (diff) return diff
  }
  // A pre-release is lower than the release it leads up to.
  if (!one.pre.length || !other.pre.length) return Math.sign(other.pre.length - one.pre.length)
  for (let index = 0; index < Math.max(one.pre.length, other.pre.length); index += 1) {
    const left = one.pre[index]
    const right = other.pre[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    const diff = compareIdentifier(left, right)
    if (diff) return diff
  }
  return 0
}

/** Which side runs the newer version, or 'unknown' when they are equal or not semantic versions. */
export function versionGap(local: string, realm: string): Gap {
  const one = parse(local)
  const other = parse(realm)
  if (!one || !other) return 'unknown'
  const diff = compare(one, other)
  return diff === 0 ? 'unknown' : diff < 0 ? 'realm-newer' : 'realm-older'
}

/** "alpha.133" out of "3.0.0-alpha.133"; the whole string without a pre-release tag. */
export function releaseName(version: string): string {
  const tag = version.match(/-([^+]+)/)
  return tag?.[1] ?? version
}
