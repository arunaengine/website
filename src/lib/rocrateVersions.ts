export type RoCrateSpecVersion = '1.1' | '1.2' | '1.3'
export type UnsupportedRoCrateSpecVersion = '1.3'

export type RoCrateSpecClassification =
  | { kind: 'supported'; version: '1.1' | '1.2' }
  | { kind: 'known-unsupported'; version: UnsupportedRoCrateSpecVersion }
  | { kind: 'non-spec' }

const SUPPORTED_SPEC_IRIS = new Map<string, '1.1' | '1.2'>([
  ['https://w3id.org/ro/crate/1.1', '1.1'],
  ['http://w3id.org/ro/crate/1.1', '1.1'],
  ['https://w3id.org/ro/crate/1.1/context', '1.1'],
  ['http://w3id.org/ro/crate/1.1/context', '1.1'],
  ['https://w3id.org/ro/crate/1.2', '1.2'],
  ['http://w3id.org/ro/crate/1.2', '1.2'],
  ['https://w3id.org/ro/crate/1.2/context', '1.2'],
  ['http://w3id.org/ro/crate/1.2/context', '1.2'],
  ['https://www.researchobject.org/ro-crate/1.2/context.jsonld', '1.2'],
])

const UNSUPPORTED_SPEC_IRIS = new Set([
  'https://w3id.org/ro/crate/1.3',
  'http://w3id.org/ro/crate/1.3',
  'https://w3id.org/ro/crate/1.3/context',
  'http://w3id.org/ro/crate/1.3/context',
  'https://www.researchobject.org/ro-crate/1.3/context.jsonld',
])

export const RO_CRATE_SPEC_IRIS = new Set([
  ...SUPPORTED_SPEC_IRIS.keys(),
  ...UNSUPPORTED_SPEC_IRIS,
])

export function classifyRoCrateSpecIri(iri: string): RoCrateSpecClassification {
  const supported = SUPPORTED_SPEC_IRIS.get(iri)
  if (supported) return { kind: 'supported', version: supported }
  if (UNSUPPORTED_SPEC_IRIS.has(iri)) return { kind: 'known-unsupported', version: '1.3' }
  return { kind: 'non-spec' }
}
