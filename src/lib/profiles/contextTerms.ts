import { termNameFromUri } from './uri'

// Term -> URI mappings from a JSON-LD `@context` value (string, object, or
// array of both). Extracted from the profile crate parser so light consumers
// (the crate presenter) can resolve custom terms without pulling the profile
// emitters and their SHACL dependencies into their bundle chunk.
//
// A mapping is dropped only when the base RO-Crate context already provides
// it, that is a schema.org URI whose local name IS the term. An alias term
// over a schema.org URI (e.g. `Author` -> schema.org/Person) is kept: crates
// use the alias as `@type`, and the base context does not define it.

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function collectContextObjects(value: unknown, out: Record<string, string>) {
  if (Array.isArray(value)) {
    for (const entry of value) collectContextObjects(entry, out)
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' && key !== '@id') out[key] = entry
      else if (isRecord(entry) && typeof entry['@id'] === 'string') out[key] = entry['@id'] as string
    }
  }
}

export function contextTermsOf(context: unknown): Record<string, string> {
  const collected: Record<string, string> = {}
  collectContextObjects(context, collected)
  const terms: Record<string, string> = {}
  for (const [term, uri] of Object.entries(collected)) {
    if (/^https?:\/\/schema\.org\//.test(uri) && termNameFromUri(uri) === term) continue
    terms[term] = uri
  }
  return terms
}
