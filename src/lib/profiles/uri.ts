// Shared URI helpers for the profile feature: schema.org / aruna constants, type
// and term URI normalization, and the small structural guards used across the lib
// and its Vue consumers. Single source of truth: no per-module copies.

export const SCHEMA_ORG = 'http://schema.org/'
export const ARUNA_PROFILE_PREFIX = 'https://w3id.org/aruna/profiles/'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// A schema.org dataset type, used to pick the root entity rule (its rules drive
// the dataset dialog / root JSON Schema; every other type becomes a `$defs` entry).
export function isDatasetType(type: string): boolean {
  return type === 'Dataset' || type.endsWith('/Dataset')
}

// http/https-insensitive comparison of two schema.org (or any) type URIs.
export function sameSchemaOrgType(a: string, b: string): boolean {
  const norm = (value: string) => value.replace(/^https:\/\/schema\.org\//, SCHEMA_ORG)
  return norm(a) === norm(b)
}

// Last `#` or `/` segment of a term/type URI, e.g. `http://schema.org/author`
// -> `author`, `https://w3id.org/aruna/profiles/p#Term` -> `Term`.
export function termNameFromUri(uri: string): string {
  const segment = uri.split(/[#/]/).filter(Boolean).pop()
  return segment || uri
}

// Plain names map to schema.org; absolute URIs (ANY scheme) pass through
// unchanged; empty input yields an empty string. The scheme must not be limited
// to http(s): a lifted SHACL file can mint a type under another scheme, and
// prefixing schema.org onto it would emit a type URI that resolves to nothing.
export function normalizeTypeUri(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value).trim()
  if (!text) return ''
  return isAbsoluteUri(text) ? text : `${SCHEMA_ORG}${text}`
}

// An absolute URI (any scheme): property term URIs must resolve in a crate
// @context, and reference inputs must be dereferenceable. Minted and
// external-ontology terms both satisfy this.
export function isAbsoluteUri(value: string): boolean {
  try {
    return Boolean(new URL(value).protocol)
  } catch {
    return false
  }
}

// Single source of truth for the entity-reference URI check + its message (L7),
// shared by submit-gating violations and the inline per-row hint so display and
// gating agree.
// A reference input holding a non-empty value that is not a valid absolute URI is
// an error (would emit a broken `{"@id"}` reference); an empty value is left to
// presence checks, not this format check.
export const REFERENCE_URI_MESSAGE = 'Use a valid reference URI (absolute, e.g. https://…).'
export function isInvalidReferenceUri(value: string): boolean {
  const text = value.trim()
  return Boolean(text) && !isAbsoluteUri(text)
}

// Compact-name discipline (D2). Property compact terms (`valueName`, the JSON
// key / mode input `name`) MUST be lower-camelCase: `^[a-z][A-Za-z0-9]*$`. Entity
// class short names (`className`, the mode class key / JSON-LD compact alias) MUST
// be upper-camelCase: `^[A-Z][A-Za-z0-9]*$`. The disjoint leading-case classes
// make property-vs-type context-key shadowing structurally impossible, so a
// `@context` can safely merge both without collisions. The profile builder (wave
// B) enforces these on the raw draft input; the lib only provides + documents
// them. Any label→name derivation helper (e.g. `propertyName()`) must emit names
// that pass `isValidPropertyTermName`; notably it must sanitize leading digits
// and a leading uppercase letter.
const PROPERTY_TERM_NAME = /^[a-z][A-Za-z0-9]*$/
const CLASS_NAME = /^[A-Z][A-Za-z0-9]*$/

export function isValidPropertyTermName(name: string): boolean {
  return PROPERTY_TERM_NAME.test(name)
}

export function isValidClassName(name: string): boolean {
  return CLASS_NAME.test(name)
}
