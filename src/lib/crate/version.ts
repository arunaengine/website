// One RO-Crate version per crate: the @context and the descriptor's conformsTo
// must agree, or the node rejects the document as a version mismatch. The node
// only accepts 1.2 and 1.3, so a 1.1 context is read and written as 1.2.

import { classifyRoCrateSpecIri, type RoCrateSpecVersion } from '@/lib/rocrateVersions'

export const DEFAULT_CRATE_VERSION: RoCrateSpecVersion = '1.2'

export function contextIri(version: RoCrateSpecVersion): string {
  return `https://w3id.org/ro/crate/${version}/context`
}

export function specIri(version: RoCrateSpecVersion): string {
  return `https://w3id.org/ro/crate/${version}`
}

function versionOf(iri: string): RoCrateSpecVersion | undefined {
  const classified = classifyRoCrateSpecIri(iri)
  return classified.kind === 'supported' ? classified.version : undefined
}

function entries(context: unknown): unknown[] {
  return Array.isArray(context) ? context : [context]
}

/** The version a crate context declares, after the 1.1 to 1.2 upgrade. */
export function contextVersion(context: unknown): RoCrateSpecVersion {
  for (const entry of entries(context)) {
    const version = typeof entry === 'string' ? versionOf(entry) : undefined
    if (version) return version === '1.1' ? DEFAULT_CRATE_VERSION : version
  }
  return DEFAULT_CRATE_VERSION
}

/** Rewrites a 1.1 context IRI to 1.2 and leaves everything else untouched. */
export function normalizeContext(context: unknown): unknown {
  const upgrade = (entry: unknown) =>
    (typeof entry === 'string' && versionOf(entry) === '1.1' ? contextIri(DEFAULT_CRATE_VERSION) : entry)
  return Array.isArray(context) ? context.map(upgrade) : upgrade(context)
}
