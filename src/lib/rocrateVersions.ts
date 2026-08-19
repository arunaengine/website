export type RoCrateSpecVersion = '1.1' | '1.2' | '1.3'

export type RoCrateSpecClassification =
  | { kind: 'supported'; version: RoCrateSpecVersion }
  | { kind: 'unknown-spec'; version: string }
  | { kind: 'non-spec' }

const SUPPORTED_SPEC_IRIS = new Map<string, RoCrateSpecVersion>([
  ['https://w3id.org/ro/crate/1.1', '1.1'],
  ['http://w3id.org/ro/crate/1.1', '1.1'],
  ['https://w3id.org/ro/crate/1.1/context', '1.1'],
  ['http://w3id.org/ro/crate/1.1/context', '1.1'],
  ['https://w3id.org/ro/crate/1.2', '1.2'],
  ['http://w3id.org/ro/crate/1.2', '1.2'],
  ['https://w3id.org/ro/crate/1.2/context', '1.2'],
  ['http://w3id.org/ro/crate/1.2/context', '1.2'],
  ['https://www.researchobject.org/ro-crate/1.2/context.jsonld', '1.2'],
  ['https://w3id.org/ro/crate/1.3', '1.3'],
  ['http://w3id.org/ro/crate/1.3', '1.3'],
  ['https://w3id.org/ro/crate/1.3/context', '1.3'],
  ['http://w3id.org/ro/crate/1.3/context', '1.3'],
  ['https://www.researchobject.org/ro-crate/1.3/context.jsonld', '1.3'],
])

const UNKNOWN_SPEC_IRI_PATTERNS = [
  /^https?:\/\/w3id\.org\/ro\/crate\/([0-9]+(?:\.[0-9]+)+(?:[-+][^/?#]+)?)(?:\/context)?\/?$/,
  /^https?:\/\/www\.researchobject\.org\/ro-crate\/([0-9]+(?:\.[0-9]+)+(?:[-+][^/?#]+)?)\/context\.jsonld$/,
]

export const RO_CRATE_SPEC_IRIS = new Set(SUPPORTED_SPEC_IRIS.keys())

export function classifyRoCrateSpecIri(iri: string): RoCrateSpecClassification {
  const supported = SUPPORTED_SPEC_IRIS.get(iri)
  if (supported) return { kind: 'supported', version: supported }
  for (const pattern of UNKNOWN_SPEC_IRI_PATTERNS) {
    const version = iri.match(pattern)?.[1]
    if (version === '1.1' || version === '1.2' || version === '1.3') {
      return { kind: 'supported', version }
    }
    if (version) return { kind: 'unknown-spec', version }
  }
  return { kind: 'non-spec' }
}
