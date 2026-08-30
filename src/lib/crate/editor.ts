// The dataset editor's working model: one flat list of entities, each with a
// type list and property values the UI can edit one row at a time. It is the
// only thing the editor page reads or writes; the RO-Crate JSON-LD is produced
// on the way out and parsed on the way in, keeping whatever this model cannot
// express verbatim.

import { slugify, uniqueId } from '@/lib/profiles/emit'
import { isAbsoluteUri, isRecord, normalizeTypeUri, SCHEMA_ORG, termNameFromUri } from '@/lib/profiles/uri'
import { RO_CRATE_PROFILE_IRI, type SubcrateLink } from '@/lib/subcrates'
import { datatypeKind, type VocabIndex, type VocabTerm } from '@/lib/profiles/vocabulary'
import { contextIri, contextVersion, DEFAULT_CRATE_VERSION, normalizeContext, specIri } from './version'

export const ROOT_ID = './'
export const DESCRIPTOR_ID = 'ro-crate-metadata.json'
const LONG_TEXT = 100

export type DraftValueKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'url'
  | 'reference'

export interface DraftValue {
  kind: DraftValueKind
  value: string
}

export interface DraftEntity {
  id: string
  types: string[]
  properties: Record<string, DraftValue[]>
  /** Values no row can express (nested objects, mixed lists), kept verbatim. */
  extra?: Record<string, unknown>
}

export interface CrateDraft {
  entities: DraftEntity[]
  visibility: 'group' | 'public'
  groupId?: string
  path?: string
  /** The node's id for a stored dataset; the node mints it when it is created. */
  documentId?: string
  /** The imported crate's @context and descriptor entity, preserved on save. */
  context?: unknown
  descriptor?: Record<string, unknown>
}

export interface RemovedReference {
  entityId: string
  property: string
}

export type IssueSeverity = 'error' | 'warning'

export interface LiveIssue {
  key: string
  severity: IssueSeverity
  message: string
  entityId: string
  property?: string
}

function values(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function idOf(value: unknown): string {
  if (typeof value === 'string') return value
  return isRecord(value) && typeof value['@id'] === 'string' ? value['@id'] : ''
}

export function rootId(draft: CrateDraft): string {
  return draft.entities[0]?.id ?? ROOT_ID
}

export function rootEntity(draft: CrateDraft): DraftEntity | undefined {
  return draft.entities[0]
}

export function findEntity(draft: CrateDraft, id: string): DraftEntity | undefined {
  return draft.entities.find((entity) => entity.id === id)
}

/** Name, else a given/family name pair, else the raw identifier. */
export function displayName(entity: DraftEntity | undefined): string {
  if (!entity) return ''
  const first = (property: string) => entity.properties[property]?.[0]?.value.trim() ?? ''
  const name = first('name')
  if (name) return name
  const person = [first('givenName'), first('familyName')].filter(Boolean).join(' ')
  return person || entity.id
}

/** The name someone typed, without the identifier fallback of displayName. */
export function entityName(entity: DraftEntity | undefined): string {
  return entity?.properties.name?.[0]?.value.trim() ?? ''
}

export function typeLabel(type: string): string {
  return termNameFromUri(type)
}

// RO-Crate names a data entity File; schema.org calls the same thing a
// MediaObject, which is where its properties are declared.
const TYPE_ALIASES: Readonly<Record<string, string>> = { File: 'MediaObject' }

/** The vocabulary URI a crate type stands for. */
export function vocabTypeUri(type: string): string {
  const name = typeLabel(type)
  return normalizeTypeUri(TYPE_ALIASES[name] ?? type)
}

export function vocabTypes(entity: DraftEntity): string[] {
  return entity.types.map(vocabTypeUri)
}

/** The types offered first when adding an entity. */
export const CURATED_TYPES = [
  'Person',
  'Organization',
  'File',
  'Dataset',
  'Place',
  'ScholarlyArticle',
  'CreativeWork',
  'ContactPoint',
  'SoftwareSourceCode',
  'Event',
  'DefinedTerm',
]

const ID_HINTS: Readonly<Record<string, string>> = {
  Person: 'An ORCID identifies a person best, e.g. https://orcid.org/0000-0002-1825-0097.',
  Organization: 'A ROR id identifies an organization best, e.g. https://ror.org/03yrm5c26.',
  ScholarlyArticle: 'A DOI identifies a publication best, e.g. https://doi.org/10.1000/xyz123.',
  CreativeWork: 'A DOI identifies a published work best, e.g. https://doi.org/10.1000/xyz123.',
  Dataset: 'A DOI or the dataset URL identifies it best.',
  Place: 'A GeoNames URL identifies a place best, e.g. https://sws.geonames.org/2921044/.',
  ContactPoint: 'An email address works well here, e.g. mailto:team@example.org.',
}

/** What makes a good identifier for this type, shown while creating one. */
export function idHint(type: string): string {
  return ID_HINTS[typeLabel(type)]
    ?? 'Keep the generated identifier, or use a URL that identifies this thing.'
}

/** The ids the root lists under hasPart: the crate's data entities. */
export function partIds(draft: CrateDraft): Set<string> {
  const root = rootEntity(draft)
  return new Set((root?.properties.hasPart ?? []).map((value) => value.value))
}

/** Root properties the dedicated form owns; the row list leaves them out. */
export const ROOT_FORM_PROPERTIES = [
  'name',
  'description',
  'datePublished',
  'license',
  'keywords',
  'conformsTo',
]

/** The entity type a root form value is promoted to for "More details". */
export const PROMOTED_TYPES: Readonly<Record<string, string>> = {
  license: 'CreativeWork',
}

/** The types that describe stored data; a contextual entity is none of them. */
export const DATA_TYPES = ['File', 'Dataset', 'MediaObject']

export function isDataType(type: string): boolean {
  return DATA_TYPES.includes(typeLabel(type))
}

export const LICENSE_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'https://creativecommons.org/licenses/by/4.0/', label: 'CC BY 4.0' },
  { value: 'https://creativecommons.org/licenses/by-sa/4.0/', label: 'CC BY-SA 4.0' },
  { value: 'https://creativecommons.org/publicdomain/zero/1.0/', label: 'CC0 1.0' },
  { value: 'https://spdx.org/licenses/MIT.html', label: 'MIT' },
  { value: 'https://www.apache.org/licenses/LICENSE-2.0', label: 'Apache 2.0' },
]

/** Well-known values a property's editor offers beside its free input. */
export const VALUE_PRESETS: Readonly<Record<string, ReadonlyArray<{ value: string; label: string }>>> = {
  license: LICENSE_PRESETS,
}

export type EntityGroup = 'root' | 'data' | 'contextual'

export function entityGroup(draft: CrateDraft, entity: DraftEntity, parts = partIds(draft)): EntityGroup {
  if (entity.id === rootId(draft)) return 'root'
  return parts.has(entity.id) ? 'data' : 'contextual'
}

/** Root first, then the data entities, then everything else. */
export function orderedEntities(draft: CrateDraft): DraftEntity[] {
  const parts = partIds(draft)
  const rank = (entity: DraftEntity) => {
    const group = entityGroup(draft, entity, parts)
    return group === 'root' ? 0 : group === 'data' ? 1 : 2
  }
  return [...draft.entities].sort((a, b) => rank(a) - rank(b))
}

export function autoId(name: string, used: Iterable<string>): string {
  const taken = new Set(used)
  return uniqueId(`#${slugify(name) || 'entity'}`, taken)
}

// ---------------------------------------------------------------------------
// Value kinds
// ---------------------------------------------------------------------------

const KIND_BY_DATATYPE: Readonly<Record<string, DraftValueKind>> = {
  text: 'text',
  longtext: 'longtext',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  date: 'date',
  datetime: 'datetime',
  url: 'url',
  email: 'text',
}

/** The property term behind a crate key, which may be a name, CURIE or URI. */
export function propertyTerm(vocab: VocabIndex | null, key: string): VocabTerm | undefined {
  if (!vocab) return undefined
  return vocab.property(key) ?? vocab.propertyNamed(key)
}

/** The value kinds a property accepts, from its range; text when unknown. */
export function valueKindsFor(vocab: VocabIndex | null, key: string): DraftValueKind[] {
  const term = propertyTerm(vocab, key)
  const kinds: DraftValueKind[] = []
  for (const target of term?.targets ?? []) {
    const datatype = datatypeKind(target)
    const kind = datatype ? KIND_BY_DATATYPE[datatype] : 'reference'
    if (kind && !kinds.includes(kind)) kinds.push(kind)
  }
  if (kinds.length) return kinds
  const bare = term?.kind ? KIND_BY_DATATYPE[term.kind] : undefined
  return [bare ?? (term?.kind === 'entity' ? 'reference' : 'text')]
}

/** The kinds a row may offer: an unknown range still allows text and a link. */
export function allowedKinds(vocab: VocabIndex | null, key: string): DraftValueKind[] {
  const kinds = valueKindsFor(vocab, key)
  if (propertyTerm(vocab, key)?.targets?.length) return kinds
  return [...new Set<DraftValueKind>([...kinds, 'text', 'reference'])]
}

/** Reference properties of `sourceTypes` whose range accepts `targetTypes`. */
export function linkProperties(
  vocab: VocabIndex | null,
  sourceTypes: string[],
  targetTypes: string[],
): VocabTerm[] {
  if (!vocab || !targetTypes.length) return []
  const wanted = new Set(targetTypes.map(vocabTypeUri))
  return vocab
    .propertiesForTypes(sourceTypes.map(vocabTypeUri))
    .filter((term) => vocab.classesInRange(term.targets).some((klass) => wanted.has(klass.uri)))
}

export const VALUE_KIND_LABELS: Readonly<Record<DraftValueKind, string>> = {
  text: 'Text',
  longtext: 'Long text',
  number: 'Number',
  boolean: 'Yes or no',
  date: 'Date',
  datetime: 'Date and time',
  url: 'URL',
  reference: 'Reference',
}

export function defaultValue(kind: DraftValueKind): DraftValue {
  return { kind, value: kind === 'boolean' ? 'false' : '' }
}

function textKind(value: string): DraftValueKind {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime'
  if (/^https?:\/\//.test(value)) return 'url'
  return value.length > LONG_TEXT ? 'longtext' : 'text'
}

function valueFrom(raw: unknown): DraftValue | undefined {
  if (typeof raw === 'string') return { kind: textKind(raw), value: raw }
  if (typeof raw === 'number') return { kind: 'number', value: String(raw) }
  if (typeof raw === 'boolean') return { kind: 'boolean', value: String(raw) }
  if (isRecord(raw) && typeof raw['@id'] === 'string' && Object.keys(raw).length === 1) {
    return { kind: 'reference', value: raw['@id'] }
  }
  return undefined
}

/** The rows a JSON-LD value stands for; undefined when no row can express it. */
export function draftValues(raw: unknown): DraftValue[] | undefined {
  const list = values(raw).map(valueFrom)
  return list.length && list.every(Boolean) ? (list as DraftValue[]) : undefined
}

function jsonFrom(value: DraftValue): unknown {
  if (value.kind === 'reference') return { '@id': value.value }
  if (value.kind === 'boolean') return value.value === 'true'
  if (value.kind === 'number') {
    const parsed = Number(value.value)
    return value.value.trim() && Number.isFinite(parsed) ? parsed : value.value
  }
  return value.value
}

// ---------------------------------------------------------------------------
// Draft edits (pure: every function answers a new draft)
// ---------------------------------------------------------------------------

function withEntities(draft: CrateDraft, entities: DraftEntity[]): CrateDraft {
  return { ...draft, entities }
}

function mapEntity(draft: CrateDraft, id: string, change: (entity: DraftEntity) => DraftEntity): CrateDraft {
  return withEntities(draft, draft.entities.map((entity) => (entity.id === id ? change(entity) : entity)))
}

export function newDraft(options: Partial<CrateDraft> = {}): CrateDraft {
  const today = new Date().toISOString().slice(0, 10)
  return {
    entities: [{
      id: ROOT_ID,
      types: ['Dataset'],
      properties: {
        name: [defaultValue('text')],
        description: [defaultValue('longtext')],
        datePublished: [{ kind: 'date', value: today }],
        license: [defaultValue('url')],
      },
    }],
    visibility: 'group',
    ...options,
  }
}

export function addEntity(
  draft: CrateDraft,
  options: { type: string; name?: string; id?: string; properties?: Record<string, DraftValue[]> },
): { draft: CrateDraft; entity: DraftEntity } {
  const name = options.name?.trim() ?? ''
  const id = options.id?.trim() || autoId(name || typeLabel(options.type), draft.entities.map((entity) => entity.id))
  const entity: DraftEntity = {
    id,
    types: [isAbsoluteUri(options.type) ? options.type : typeLabel(options.type)],
    properties: {
      ...(name ? { name: [{ kind: 'text' as const, value: name }] } : {}),
      ...options.properties,
    },
  }
  const existing = findEntity(draft, id)
  if (existing) return { draft, entity: existing }
  return { draft: withEntities(draft, [...draft.entities, entity]), entity }
}

/** Drops an entity and every reference to it, reporting what pointed at it. */
export function removeEntity(
  draft: CrateDraft,
  id: string,
): { draft: CrateDraft; removed: RemovedReference[] } {
  const removed: RemovedReference[] = []
  const entities: DraftEntity[] = []
  for (const entity of draft.entities) {
    if (entity.id === id) continue
    const properties: Record<string, DraftValue[]> = {}
    for (const [property, list] of Object.entries(entity.properties)) {
      const kept = list.filter((value) => !(value.kind === 'reference' && value.value === id))
      if (kept.length !== list.length) removed.push({ entityId: entity.id, property })
      if (kept.length) properties[property] = kept
    }
    entities.push({ ...entity, properties })
  }
  return { draft: withEntities(draft, entities), removed }
}

/** Renames an entity, rewriting every reference that pointed at the old id. */
export function renameEntity(draft: CrateDraft, id: string, nextId: string): CrateDraft {
  const target = nextId.trim()
  if (!target || target === id || findEntity(draft, target)) return draft
  const entities = draft.entities.map((entity) => ({
    ...entity,
    id: entity.id === id ? target : entity.id,
    properties: Object.fromEntries(Object.entries(entity.properties).map(([property, list]) => [
      property,
      list.map((value) => (value.kind === 'reference' && value.value === id ? { ...value, value: target } : value)),
    ])),
  }))
  return withEntities(draft, entities)
}

export function setTypes(draft: CrateDraft, id: string, types: string[]): CrateDraft {
  const unique = [...new Set(types.map((type) => isAbsoluteUri(type) ? type : typeLabel(type)).filter(Boolean))]
  if (!unique.length) return draft
  return mapEntity(draft, id, (entity) => ({ ...entity, types: unique }))
}

export function setProperty(
  draft: CrateDraft,
  id: string,
  property: string,
  list: DraftValue[],
): CrateDraft {
  return mapEntity(draft, id, (entity) => {
    const properties = { ...entity.properties }
    if (list.length) properties[property] = list
    else delete properties[property]
    return { ...entity, properties }
  })
}

export function addValue(draft: CrateDraft, id: string, property: string, value: DraftValue): CrateDraft {
  const entity = findEntity(draft, id)
  return setProperty(draft, id, property, [...(entity?.properties[property] ?? []), value])
}

/** Removing the last value of a property drops the property itself. */
export function removeValue(draft: CrateDraft, id: string, property: string, index: number): CrateDraft {
  const list = findEntity(draft, id)?.properties[property] ?? []
  return setProperty(draft, id, property, list.filter((_, position) => position !== index))
}

export function updateValue(
  draft: CrateDraft,
  id: string,
  property: string,
  index: number,
  value: string,
): CrateDraft {
  const list = findEntity(draft, id)?.properties[property] ?? []
  return setProperty(draft, id, property, list.map((entry, position) =>
    (position === index ? { ...entry, value } : entry)))
}

export function changeKind(
  draft: CrateDraft,
  id: string,
  property: string,
  index: number,
  kind: DraftValueKind,
): CrateDraft {
  const list = findEntity(draft, id)?.properties[property] ?? []
  return setProperty(draft, id, property, list.map((entry, position) =>
    (position === index ? { kind, value: entry.value } : entry)))
}

/**
 * Turns one literal value into a linked entity of `type`: a URL becomes the
 * entity's identifier, a preset keeps its label as the name, plain text becomes
 * the name, and an email address becomes a mailto contact.
 */
export function promoteValue(
  draft: CrateDraft,
  entityId: string,
  property: string,
  index: number,
  type: string,
): { draft: CrateDraft; entity: DraftEntity } | undefined {
  const value = findEntity(draft, entityId)?.properties[property]?.[index]
  const text = value?.value.trim() ?? ''
  if (!value || value.kind === 'reference' || !text) return undefined
  const preset = VALUE_PRESETS[property]?.find((candidate) => candidate.value === text)
  const email = !isAbsoluteUri(text) && /^[^\s@]+@[^\s@]+$/.test(text) ? text : ''
  const url = isAbsoluteUri(text) ? text : ''
  const name = preset?.label ?? (url ? '' : email ? '' : text)
  const properties: Record<string, DraftValue[]> = {
    ...(name ? { name: [{ kind: 'text', value: name }] } : {}),
    ...(url && !preset ? { url: [{ kind: 'url', value: url }] } : {}),
    ...(email ? { email: [{ kind: 'text', value: email }] } : {}),
  }
  const id = url || (email ? `mailto:${email}` : '')
  const created = addEntity(draft, { type, ...(id ? { id } : { name }), properties })
  return {
    draft: updateReference(created.draft, entityId, property, index, created.entity.id),
    entity: created.entity,
  }
}

function updateReference(draft: CrateDraft, id: string, property: string, index: number, target: string): CrateDraft {
  const list = findEntity(draft, id)?.properties[property] ?? []
  return setProperty(draft, id, property, list.map((entry, position) =>
    (position === index ? { kind: 'reference' as const, value: target } : entry)))
}

export interface ReferenceUse {
  entityId: string
  property: string
  index: number
}

/** Every place in the draft that points at this entity. */
export function referencesTo(draft: CrateDraft, id: string): ReferenceUse[] {
  const uses: ReferenceUse[] = []
  for (const entity of draft.entities) {
    for (const [property, list] of Object.entries(entity.properties)) {
      for (const [index, value] of list.entries()) {
        if (value.kind === 'reference' && value.value === id) uses.push({ entityId: entity.id, property, index })
      }
    }
  }
  return uses
}

// ---------------------------------------------------------------------------
// Data entities
// ---------------------------------------------------------------------------

export interface FilePart {
  id: string
  name: string
  /** `Dataset` for a picked folder; `File` for a single object. */
  type?: string
  contentUrl?: string
  encodingFormat?: string
  contentSize?: string
}

function reference(id: string): DraftValue[] {
  return [{ kind: 'reference', value: id }]
}

function textValue(value: string): DraftValue[] {
  return [{ kind: textKind(value), value }]
}

function linkPart(draft: CrateDraft, id: string): CrateDraft {
  const root = rootEntity(draft)
  if (!root || root.properties.hasPart?.some((value) => value.value === id)) return draft
  return addValue(draft, root.id, 'hasPart', { kind: 'reference', value: id })
}

export function addFilePart(draft: CrateDraft, part: FilePart): CrateDraft {
  const properties: Record<string, DraftValue[]> = {
    name: textValue(part.name || part.id),
    ...(part.contentUrl ? { contentUrl: textValue(part.contentUrl) } : {}),
    ...(part.encodingFormat ? { encodingFormat: textValue(part.encodingFormat) } : {}),
    ...(part.contentSize ? { contentSize: textValue(part.contentSize) } : {}),
  }
  const added = addEntity(draft, { type: part.type ?? 'File', id: part.id, properties })
  return linkPart(added.draft, part.id)
}

/** A referenced dataset, per the RO-Crate rules for linking another crate. */
export function addSubcratePart(draft: CrateDraft, link: SubcrateLink): CrateDraft {
  const properties: Record<string, DraftValue[]> = {
    name: textValue(link.name),
    conformsTo: reference(RO_CRATE_PROFILE_IRI),
    ...(link.identifier ? { identifier: textValue(link.identifier) } : {}),
    ...(link.subjectOf ? { subjectOf: reference(link.subjectOf) } : {}),
  }
  let next = addEntity(draft, { type: 'Dataset', id: link.iri, properties }).draft
  if (link.subjectOf) {
    next = addEntity(next, {
      type: 'CreativeWork',
      id: link.subjectOf,
      properties: { encodingFormat: textValue('application/ld+json') },
    }).draft
  }
  return linkPart(next, link.iri)
}

// ---------------------------------------------------------------------------
// RO-Crate conversion
// ---------------------------------------------------------------------------

export function toRoCrate(draft: CrateDraft): Record<string, unknown> {
  const context = draft.context ?? contextIri(DEFAULT_CRATE_VERSION)
  const graph: Record<string, unknown>[] = [{
    '@id': DESCRIPTOR_ID,
    '@type': 'CreativeWork',
    conformsTo: { '@id': specIri(contextVersion(context)) },
    about: { '@id': rootId(draft) },
    ...draft.descriptor,
  }]
  for (const entity of draft.entities) {
    const node: Record<string, unknown> = {
      '@id': entity.id,
      '@type': entity.types.length === 1 ? entity.types[0] : entity.types,
    }
    for (const [property, list] of Object.entries(entity.properties)) {
      // An empty row is a prompt in the editor, not a value in the crate.
      const filled = list.filter((value) => value.kind === 'boolean' || value.value.trim())
      if (!filled.length) continue
      const encoded = filled.map(jsonFrom)
      node[property] = encoded.length === 1 ? encoded[0] : encoded
    }
    for (const [property, value] of Object.entries(entity.extra ?? {})) node[property] = value
    graph.push(node)
  }
  return { '@context': context, '@graph': graph }
}

export function fromRoCrate(
  crateValue: unknown,
  options: Partial<Pick<CrateDraft, 'groupId' | 'path' | 'visibility'>> = {},
): CrateDraft {
  const crate = isRecord(crateValue) ? crateValue : {}
  const graph = values(crate['@graph']).filter(isRecord)
  const descriptorNode = graph.find((node) => node['@id'] === DESCRIPTOR_ID)
  const root = idOf(descriptorNode?.about) || ROOT_ID
  const entities: DraftEntity[] = []
  for (const node of graph) {
    const id = typeof node['@id'] === 'string' ? node['@id'] : ''
    if (!id || id === DESCRIPTOR_ID) continue
    const types = values(node['@type']).map(String).filter(Boolean)
    const properties: Record<string, DraftValue[]> = {}
    const extra: Record<string, unknown> = {}
    for (const [property, raw] of Object.entries(node)) {
      if (property === '@id' || property === '@type') continue
      const list = raw === undefined ? undefined : draftValues(raw)
      if (list) properties[property] = list
      else extra[property] = raw
    }
    entities.push({
      id,
      types: types.length ? types : ['Thing'],
      properties,
      ...(Object.keys(extra).length ? { extra } : {}),
    })
  }
  const rootIndex = entities.findIndex((entity) => entity.id === root)
  if (rootIndex > 0) entities.unshift(...entities.splice(rootIndex, 1))
  const { ['@id']: _id, ['@type']: _type, conformsTo: _conformsTo, about: _about, ...descriptor } = descriptorNode ?? {}
  return {
    entities: entities.length ? entities : newDraft().entities,
    visibility: options.visibility ?? 'group',
    ...(options.groupId ? { groupId: options.groupId } : {}),
    ...(options.path ? { path: options.path } : {}),
    ...(crate['@context'] === undefined ? {} : { context: normalizeContext(crate['@context']) }),
    ...(Object.keys(descriptor).length ? { descriptor } : {}),
  }
}

// ---------------------------------------------------------------------------
// Advisory issues
// ---------------------------------------------------------------------------

// The node rejects a crate without name, description or datePublished; a
// missing license only reads badly.
const ROOT_EXPECTED: Array<{ property: string; message: string; severity: IssueSeverity }> = [
  { property: 'name', message: 'The dataset needs a name.', severity: 'error' },
  { property: 'description', message: 'Describe what the dataset contains.', severity: 'error' },
  { property: 'license', message: 'State a license so others know the terms of reuse.', severity: 'warning' },
  { property: 'datePublished', message: 'Add the date the dataset was published.', severity: 'error' },
]

function filled(entity: DraftEntity | undefined, property: string): boolean {
  return Boolean(entity?.properties[property]?.some((value) => value.value.trim()))
}

/** What a selected profile asks of the draft, checked as suggestions. */
export interface ProfileExpectation {
  name: string
  properties: string[]
  types: string[]
}

/** Everything the editor can say about a draft on its own, all advisory. */
export function liveIssues(
  draft: CrateDraft,
  vocab: VocabIndex | null = null,
  profile: ProfileExpectation | null = null,
): LiveIssue[] {
  const issues: LiveIssue[] = []
  const root = rootEntity(draft)
  const ids = new Set(draft.entities.map((entity) => entity.id))
  const parts = partIds(draft)

  for (const expected of ROOT_EXPECTED) {
    if (filled(root, expected.property)) continue
    issues.push({
      key: `root:${expected.property}`,
      severity: expected.severity,
      message: expected.message,
      entityId: rootId(draft),
      property: expected.property,
    })
  }

  for (const entity of draft.entities) {
    const isRoot = entity.id === rootId(draft)
    if (!isRoot && !filled(entity, 'name')) {
      issues.push({
        key: `name:${entity.id}`,
        severity: 'warning',
        message: `${entity.id} has no name.`,
        entityId: entity.id,
        property: 'name',
      })
    }
    for (const [property, list] of Object.entries(entity.properties)) {
      const targets = vocab ? propertyTerm(vocab, property)?.targets ?? [] : []
      const allowed = new Set(vocab ? vocab.classesInRange(targets).map((term) => term.uri) : [])
      for (const [index, value] of list.entries()) {
        if (isRoot && ROOT_EXPECTED.some((expected) => expected.property === property)) continue
        if (!value.value.trim() && value.kind !== 'boolean') {
          issues.push({
            key: `empty:${entity.id}:${property}:${index}`,
            severity: 'warning',
            message: `${property} on ${displayName(entity)} has no value yet.`,
            entityId: entity.id,
            property,
          })
          continue
        }
        if (value.kind !== 'reference') continue
        if (!ids.has(value.value) && !isAbsoluteUri(value.value)) {
          issues.push({
            key: `missing:${entity.id}:${property}:${index}`,
            severity: 'error',
            message: `${property} on ${displayName(entity)} points at ${value.value}, which is not in this dataset.`,
            entityId: entity.id,
            property,
          })
          continue
        }
        const target = findEntity(draft, value.value)
        if (!target || !allowed.size || parts.has(target.id)) continue
        if (target.types.some((type) => allowed.has(normalizeTypeUri(type)))) continue
        const expected = targets.filter((uri) => !datatypeKind(uri)).map(typeLabel).join(', ')
        issues.push({
          key: `range:${entity.id}:${property}:${index}`,
          severity: 'warning',
          message: `${property} usually points at ${expected}, not ${target.types.join(', ')}.`,
          entityId: entity.id,
          property,
        })
      }
    }
  }

  for (const property of profile?.properties ?? []) {
    if (filled(root, property) || ROOT_EXPECTED.some((expected) => expected.property === property)) continue
    issues.push({
      key: `profile:${property}`,
      severity: 'warning',
      message: `${profile?.name} expects ${property}.`,
      entityId: rootId(draft),
      property,
    })
  }
  for (const type of profile?.types ?? []) {
    const label = typeLabel(type)
    if (draft.entities.some((entity) => entity.types.some((candidate) => typeLabel(candidate) === label))) continue
    issues.push({
      key: `profileType:${type}`,
      severity: 'warning',
      message: `${profile?.name} expects a ${label}.`,
      entityId: rootId(draft),
    })
  }
  return issues
}

export function issueCountsBySeverity(issues: LiveIssue[]): Record<IssueSeverity, number> {
  return {
    error: issues.filter((issue) => issue.severity === 'error').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
  }
}

/** A crate key for a picked term: a bare name for schema.org, else the URI. */
export function propertyKey(term: VocabTerm): string {
  return term.uri.startsWith(SCHEMA_ORG) ? term.name : term.uri
}
