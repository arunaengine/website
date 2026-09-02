// The node check the profile tutorial shows. It reads the draft it is handed
// and answers from it: every property the tutorial profile requires must be
// there and carry a value, so correcting the form really flips the verdict.
import type { ProfileValidationFinding, ProfileValidationPreviewResponse } from '@/lib/api'
import {
  TUTORIAL_PROFILE_DOC_ID,
  TUTORIAL_REQUIRED_PERSON,
  TUTORIAL_REQUIRED_ROOT,
} from '../fixtures/profile'

const PROFILE_IRI = `https://w3id.org/aruna/profile/${TUTORIAL_PROFILE_DOC_ID}`
const PERSON_TYPE = 'Person'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function graph(rocrate: unknown): Array<Record<string, unknown>> {
  const entries = isRecord(rocrate) ? rocrate['@graph'] : undefined
  return Array.isArray(entries) ? entries.filter(isRecord) : []
}

// A draft names a type either compactly or by its full URI, and both stand for
// the same shape.
function isType(entity: Record<string, unknown>, name: string): boolean {
  const value = entity['@type']
  return (Array.isArray(value) ? value : [value])
    .filter((entry): entry is string => typeof entry === 'string')
    .some((type) => type === name || type.endsWith(`/${name}`))
}

/** A property counts as answered when at least one of its values has content. */
function present(entity: Record<string, unknown>, property: string): boolean {
  const value = entity[property]
  const list = Array.isArray(value) ? value : [value]
  return list.some((entry) => {
    if (typeof entry === 'string') return entry.trim().length > 0
    if (typeof entry === 'number' || typeof entry === 'boolean') return true
    return isRecord(entry) && typeof entry['@id'] === 'string' && entry['@id'].trim().length > 0
  })
}

function missing(entity: Record<string, unknown>, property: string): ProfileValidationFinding {
  const id = typeof entity['@id'] === 'string' ? entity['@id'] : './'
  return {
    code: 'missing_required_property',
    severity: 'violation',
    focus_node: id,
    path: `schema:${property}`,
    rule: `${PROFILE_IRI}#${property}`,
    message: `Node <${id}> is missing the required property \`schema:${property}\`.`,
    completeness: 'complete',
  }
}

function rootEntity(entries: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  const descriptor = entries.find((entry) => entry['@id'] === 'ro-crate-metadata.json')
  const about = isRecord(descriptor?.about) ? descriptor.about['@id'] : undefined
  const id = typeof about === 'string' ? about : './'
  return entries.find((entry) => entry['@id'] === id) ?? entries.find((entry) => entry['@id'] === './')
}

/** What the tutorial profile asks of one draft, checked without a node. */
export function tutorialFindings(rocrate: unknown): ProfileValidationFinding[] {
  const entries = graph(rocrate)
  const root = rootEntity(entries)
  const findings: ProfileValidationFinding[] = []
  if (!root) return findings
  for (const property of TUTORIAL_REQUIRED_ROOT) {
    if (!present(root, property)) findings.push(missing(root, property))
  }
  for (const entity of entries) {
    if (entity === root || !isType(entity, PERSON_TYPE)) continue
    for (const property of TUTORIAL_REQUIRED_PERSON) {
      if (!present(entity, property)) findings.push(missing(entity, property))
    }
  }
  return findings
}

export async function tutorialPreview(rocrate: unknown): Promise<ProfileValidationPreviewResponse> {
  const findings = tutorialFindings(rocrate)
  return {
    accepted: findings.length === 0,
    state: findings.length ? 'invalid' : 'valid',
    profile_id: TUTORIAL_PROFILE_DOC_ID,
    profile_iri: PROFILE_IRI,
    evaluator: 'tutorial',
    findings,
    completeness: 'complete',
    structural_violations: [],
  }
}
