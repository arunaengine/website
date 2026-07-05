import { RO_CRATE_CONTEXT, type ProfileEntityRule, type ProfileValueKind } from './types'
import { ARUNA_PROFILE_PREFIX, SCHEMA_ORG as SCHEMA, termNameFromUri } from './uri'

export { termNameFromUri } from './uri'

// Curated, extensible catalogue of schema.org property terms offered per owning
// entity type in the profile builder. Mirrors the entityTypes.ts pattern: URIs
// use the `http://schema.org/<name>` convention, user customs persist in
// localStorage, and authors can paste an external ontology URI or mint an aruna
// term.

export interface PropertyTermOption {
  uri: string
  name: string
  label: string
  description: string
  // Non-binding hints the builder applies as a default when this term is picked
  // (the author may override): the value kind and, for `entity` kinds, the target
  // entity type URIs (schema.org form, matching entityTypes.ts). Emitted only when
  // set so plain custom terms stay clean.
  suggestedKind?: ProfileValueKind
  suggestedEntityTypes?: string[]
}

interface TermSuggestion {
  kind?: ProfileValueKind
  entityTypes?: string[]
}

function term(
  name: string,
  label: string,
  description: string,
  suggestion?: TermSuggestion,
): PropertyTermOption {
  const option: PropertyTermOption = { uri: `${SCHEMA}${name}`, name, label, description }
  if (suggestion?.kind) option.suggestedKind = suggestion.kind
  if (suggestion?.entityTypes?.length) option.suggestedEntityTypes = [...suggestion.entityTypes]
  return option
}

// Common entity-reference targets, reused across term suggestions. `term()` copies
// the array, so sharing these is safe.
const PERSON_ORG_TYPES = [`${SCHEMA}Person`, `${SCHEMA}Organization`]
const THING_TYPES = [`${SCHEMA}Thing`]

const DATASET_TERMS: PropertyTermOption[] = [
  term('author', 'Author', 'A person or organization responsible for the dataset.', { kind: 'entity', entityTypes: PERSON_ORG_TYPES }),
  term('creator', 'Creator', 'A person or organization that created the dataset.', { kind: 'entity', entityTypes: PERSON_ORG_TYPES }),
  term('contributor', 'Contributor', 'A secondary contributor to the dataset.', { kind: 'entity', entityTypes: PERSON_ORG_TYPES }),
  term('keywords', 'Keywords', 'Keywords or tags describing the dataset.', { kind: 'keyword-list' }),
  term('identifier', 'Identifier', 'A persistent identifier such as a DOI.', { kind: 'url' }),
  term('publisher', 'Publisher', 'The organization that published the dataset.', { kind: 'entity', entityTypes: PERSON_ORG_TYPES }),
  term('funder', 'Funder', 'A person or organization that funded the work.', { kind: 'entity', entityTypes: PERSON_ORG_TYPES }),
  term('citation', 'Citation', 'A related work that should be cited.', { kind: 'entity', entityTypes: [`${SCHEMA}CreativeWork`] }),
  term('license', 'License', 'The license under which the dataset is released.', { kind: 'url' }),
  term('temporalCoverage', 'Temporal coverage', 'The time period the dataset covers.', { kind: 'text' }),
  term('spatialCoverage', 'Spatial coverage', 'The geographic area the dataset covers.'),
  term('inLanguage', 'Language', 'The language of the dataset content.'),
  term('variableMeasured', 'Variable measured', 'A variable that the dataset measures.'),
  term('measurementTechnique', 'Measurement technique', 'The technique or method used to collect the data.'),
  term('about', 'About', 'The subject matter of the dataset.', { kind: 'entity', entityTypes: THING_TYPES }),
  term('url', 'URL', 'A URL of the dataset or a page describing it.', { kind: 'url' }),
  // Structural + provenance terms that shape crate content.
  term('hasPart', 'Has part', 'A file or nested dataset contained in this dataset.', { kind: 'entity', entityTypes: [`${SCHEMA}MediaObject`, `${SCHEMA}Dataset`] }),
  term('isPartOf', 'Is part of', 'A larger dataset this dataset belongs to.', { kind: 'entity', entityTypes: [`${SCHEMA}Dataset`] }),
  term('mentions', 'Mentions', 'An entity referenced or discussed by the dataset.', { kind: 'entity', entityTypes: THING_TYPES }),
  term('contentLocation', 'Content location', 'The place the dataset content is about or was collected.', { kind: 'entity', entityTypes: [`${SCHEMA}Place`] }),
  term('mainEntity', 'Main entity', 'The primary entity this dataset describes.', { kind: 'entity', entityTypes: THING_TYPES }),
  term('dateCreated', 'Date created', 'The date the dataset was created.', { kind: 'date' }),
  term('dateModified', 'Date modified', 'The date the dataset was last modified.', { kind: 'date' }),
]

const PERSON_TERMS: PropertyTermOption[] = [
  term('name', 'Name', 'The full name of the person.'),
  term('givenName', 'Given name', 'The given (first) name of the person.'),
  term('familyName', 'Family name', 'The family (last) name of the person.'),
  term('email', 'Email', 'The email address of the person.', { kind: 'email' }),
  term('identifier', 'Identifier', 'A persistent identifier such as an ORCID.', { kind: 'url' }),
  term('affiliation', 'Affiliation', 'The organization the person is affiliated with.', { kind: 'entity', entityTypes: [`${SCHEMA}Organization`] }),
]

const ORGANIZATION_TERMS: PropertyTermOption[] = [
  term('name', 'Name', 'The name of the organization.'),
  term('url', 'URL', 'A URL of the organization.', { kind: 'url' }),
  term('identifier', 'Identifier', 'A persistent identifier such as a ROR.', { kind: 'url' }),
  term('member', 'Member', 'A member of the organization.', { kind: 'entity', entityTypes: [`${SCHEMA}Person`] }),
]

const THING_TERMS: PropertyTermOption[] = [
  term('name', 'Name', 'The name of the entity.'),
  term('description', 'Description', 'A description of the entity.'),
  term('identifier', 'Identifier', 'A persistent identifier for the entity.', { kind: 'url' }),
  term('url', 'URL', 'A URL for the entity.', { kind: 'url' }),
  term('sameAs', 'Same as', 'A URL of a reference page that identifies the entity.', { kind: 'url' }),
]

// Properties offered on File / MediaObject data entities (the class the builder
// exposes as MediaObject; RO-Crate files are emitted with `@type: File`).
const FILE_TERMS: PropertyTermOption[] = [
  term('encodingFormat', 'Encoding format', 'The media type (MIME type) of the file.', { kind: 'text' }),
  term('contentSize', 'Content size', 'The size of the file, e.g. in bytes.', { kind: 'text' }),
  term('dateModified', 'Date modified', 'The date the file was last modified.', { kind: 'date' }),
  term('about', 'About', 'The subject matter of the file.', { kind: 'entity', entityTypes: THING_TYPES }),
  term('license', 'License', 'The license under which the file is released.', { kind: 'url' }),
]

const PLACE_TERMS: PropertyTermOption[] = [
  term('name', 'Name', 'The name of the place.'),
  term('description', 'Description', 'A description of the place.'),
  term('address', 'Address', 'The postal address of the place.', { kind: 'text' }),
]

const TERMS_BY_TYPE: Record<string, PropertyTermOption[]> = {
  [`${SCHEMA}Dataset`]: DATASET_TERMS,
  [`${SCHEMA}CreativeWork`]: DATASET_TERMS,
  [`${SCHEMA}Person`]: PERSON_TERMS,
  [`${SCHEMA}Organization`]: ORGANIZATION_TERMS,
  [`${SCHEMA}Thing`]: THING_TERMS,
  [`${SCHEMA}MediaObject`]: FILE_TERMS,
  [`${SCHEMA}Place`]: PLACE_TERMS,
}

// Deduplicated union of every curated term, keyed by URI.
export const CURATED_PROPERTY_TERMS: PropertyTermOption[] = dedupeByUri([
  ...DATASET_TERMS,
  ...PERSON_TERMS,
  ...ORGANIZATION_TERMS,
  ...THING_TERMS,
  ...FILE_TERMS,
  ...PLACE_TERMS,
])

const CUSTOM_TERMS_KEY = 'aruna.customPropertyTerms'

// Curated schema.org properties for the given owning entity type. Unknown types
// fall back to the generic Thing set.
export function propertyTermsForType(typeUri: string): PropertyTermOption[] {
  return TERMS_BY_TYPE[normalizeSchemaOrg(typeUri)] ?? THING_TERMS
}

export function isSchemaOrgUri(uri: string): boolean {
  return uri.startsWith('http://schema.org/') || uri.startsWith('https://schema.org/')
}

// Mint an aruna-hosted term URI for a genuinely custom property.
export function mintTermUri(slug: string, term: string): string {
  return `${ARUNA_PROFILE_PREFIX}${slug}#${term}`
}

export function loadCustomPropertyTerms(): PropertyTermOption[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TERMS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Partial<PropertyTermOption> => Boolean(item) && typeof item.uri === 'string')
      .map((item) => normalizeCustomTerm(item))
  } catch {
    return []
  }
}

// Remember a user-entered custom term so it appears as a normal option next time.
// Curated URIs and duplicates are skipped. Returns the updated custom list.
export function saveCustomPropertyTerm(option: PropertyTermOption): PropertyTermOption[] {
  const existing = loadCustomPropertyTerms()
  const curated = new Set(CURATED_PROPERTY_TERMS.map((entry) => entry.uri))
  if (curated.has(option.uri) || existing.some((entry) => entry.uri === option.uri)) return existing
  const next = [...existing, normalizeCustomTerm(option)]
  try {
    localStorage.setItem(CUSTOM_TERMS_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures (private mode, quota); the option still shows this session.
  }
  return next
}

// Non-schema.org term → URI mappings across all entity rules, for the crate
// `@context`. Property terms map their compact `valueName` to `propertyUri`;
// custom entity types map their canonical `className` (D3) to the type URI so
// both the property keys and the `@type` tokens resolve in generated crates and
// an imported class alias is preserved.
function contextTerms(entities: ProfileEntityRule[]): Record<string, string> {
  const terms: Record<string, string> = {}
  for (const entity of entities) {
    if (entity.type && !isSchemaOrgUri(entity.type)) {
      terms[entity.className || termNameFromUri(entity.type)] = entity.type
    }
    for (const rule of entity.propertyRules) {
      if (rule.propertyUri && rule.valueName && !isSchemaOrgUri(rule.propertyUri)) {
        terms[rule.valueName] = rule.propertyUri
      }
    }
  }
  return terms
}

// RO-Crate `@context`: the plain context URL when every term is schema.org, else
// the array form pairing the context URL with the custom term mappings. Class
// mappings (className → type URI) are written before property mappings and take
// precedence; the builder guarantees className (`^[A-Z]…`) and valueName
// (`^[a-z]…`, see the uri.ts D2 helpers) never collide, so the merged mapping is
// unambiguous.
export function buildProfileContext(
  entities: ProfileEntityRule[],
  extraTerms: Record<string, string> = {},
): string | [string, Record<string, string>] {
  const terms = { ...contextTerms(entities), ...extraTerms }
  return Object.keys(terms).length ? [RO_CRATE_CONTEXT, terms] : RO_CRATE_CONTEXT
}

function normalizeCustomTerm(item: Partial<PropertyTermOption>): PropertyTermOption {
  const uri = item.uri as string
  const name = item.name || termNameFromUri(uri)
  const option: PropertyTermOption = {
    uri,
    name,
    label: item.label || name,
    description: item.description || '',
  }
  // Tolerate (and preserve) the optional suggestion hints when present; older
  // persisted terms simply omit them.
  if (item.suggestedKind) option.suggestedKind = item.suggestedKind
  if (Array.isArray(item.suggestedEntityTypes)) option.suggestedEntityTypes = [...item.suggestedEntityTypes]
  return option
}

function normalizeSchemaOrg(uri: string): string {
  return uri.replace(/^https:\/\/schema\.org\//, 'http://schema.org/')
}

function dedupeByUri(options: PropertyTermOption[]): PropertyTermOption[] {
  const seen = new Set<string>()
  const result: PropertyTermOption[] = []
  for (const option of options) {
    if (seen.has(option.uri)) continue
    seen.add(option.uri)
    result.push(option)
  }
  return result
}
