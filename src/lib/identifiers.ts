// Shared identifier detection for crate entities: the Aruna `{ulid}@{realm}`
// user id plus ORCID and ROR forms (bare id or canonical URL), so every view
// links the same values the same way.

export const ARUNA_USER_ID = /^[0-9A-HJKMNP-TV-Z]{26}@[A-Za-z0-9_-]{43}$/
export const ORCID = /(?:^|orcid\.org\/)(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/
export const ROR = /ror\.org\/(0[a-z0-9]{8})$/

export function isArunaUserId(value: unknown): value is string {
  return typeof value === 'string' && ARUNA_USER_ID.test(value)
}

/** The bare ORCID inside `value` (a bare id or an orcid.org URL), if any. */
export function orcidOf(value: unknown): string | undefined {
  return typeof value === 'string' ? ORCID.exec(value)?.[1] : undefined
}

/** The bare ROR id inside `value` (a ror.org URL, scheme optional), if any. */
export function rorOf(value: unknown): string | undefined {
  return typeof value === 'string' ? ROR.exec(value)?.[1] : undefined
}

// Human-readable tail of an IRI (last path/fragment segment) for chips and
// cards that surface an IRI which resolves to no local name.
export function readableIri(iri: string): string {
  const withoutQuery = iri.split('?')[0].replace(/\/+$/, '')
  return withoutQuery.split(/[/#]/).filter(Boolean).pop() || iri
}
