// Curated, extensible catalogue of RO-Crate entity types offered in the profile
// builder. URIs keep the `http://schema.org/<Type>` convention so isDatasetType
// (suffix `/Dataset`) and schemaFromEntityRules resolve types unchanged. Authors
// can add their own types, remembered as a user preference in localStorage.

import { termNameFromUri } from './uri'

// Short human label for a type URI ("http://schema.org/Person" -> "Person").
// A thin re-export of the shared term-name helper so entity-type call sites read
// intent-fully; both names resolve identically.
export { termNameFromUri as entityTypeLabel } from './uri'

export interface EntityTypeOption {
  uri: string
  label: string
  description: string
}

export interface CustomEntityType {
  uri: string
  label: string
}

export const CURATED_ENTITY_TYPES: EntityTypeOption[] = [
  { uri: 'http://schema.org/Dataset', label: 'Dataset', description: 'A collection of data, the crate root and any nested datasets.' },
  { uri: 'http://schema.org/Person', label: 'Person', description: 'A person, e.g. an author, creator or contributor.' },
  { uri: 'http://schema.org/Organization', label: 'Organization', description: 'An organization such as a lab, institution or publisher.' },
  { uri: 'http://schema.org/CreativeWork', label: 'CreativeWork', description: 'A generic creative work referenced by the RO-Crate.' },
  { uri: 'http://schema.org/ScholarlyArticle', label: 'ScholarlyArticle', description: 'A scholarly article or publication.' },
  { uri: 'http://schema.org/SoftwareSourceCode', label: 'SoftwareSourceCode', description: 'Source code for a piece of software.' },
  { uri: 'http://schema.org/SoftwareApplication', label: 'SoftwareApplication', description: 'A runnable software application or tool.' },
  { uri: 'http://schema.org/MediaObject', label: 'MediaObject', description: 'A media file such as audio, video or a document.' },
  { uri: 'http://schema.org/ImageObject', label: 'ImageObject', description: 'An image file.' },
  { uri: 'http://schema.org/Place', label: 'Place', description: 'A geographic location or place.' },
  { uri: 'http://schema.org/Event', label: 'Event', description: 'An event such as a run, experiment or workshop.' },
  { uri: 'http://schema.org/ContactPoint', label: 'ContactPoint', description: 'A contact point for a person or organization.' },
  { uri: 'http://schema.org/DefinedTerm', label: 'DefinedTerm', description: 'A term from a controlled vocabulary or ontology.' },
  { uri: 'http://schema.org/Taxon', label: 'Taxon', description: 'A biological taxon, e.g. a species.' },
]

const CUSTOM_TYPES_KEY = 'aruna.customEntityTypes'
const CURATED_URIS = new Set(CURATED_ENTITY_TYPES.map((type) => type.uri))

export function loadCustomEntityTypes(): CustomEntityType[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TYPES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Partial<CustomEntityType> => Boolean(item) && typeof item.uri === 'string')
      .map((item) => ({ uri: item.uri as string, label: item.label || termNameFromUri(item.uri as string) }))
  } catch {
    return []
  }
}

// Remember a user-entered custom type so it appears as a normal option next time.
// Curated URIs and duplicates are skipped. Returns the updated custom list.
export function saveCustomEntityType(uri: string): CustomEntityType[] {
  const existing = loadCustomEntityTypes()
  if (CURATED_URIS.has(uri) || existing.some((type) => type.uri === uri)) return existing
  const next = [...existing, { uri, label: termNameFromUri(uri) }]
  try {
    localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures (private mode, quota); the option still shows this session.
  }
  return next
}
