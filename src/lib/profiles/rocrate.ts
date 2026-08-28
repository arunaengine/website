import { parseSchemaText, schemaFromEntityRules } from './schema'
import { effectiveEntitySources } from './sources'
import { entityRulesToMode, isModeFile, modeToEntityRules, type ModeFile } from './mode'
import { buildProfileContext } from './propertyCatalog'
import { collectContextObjects, contextTermsOf } from './contextTerms'
import { shapesFromEntityRules } from '../shacl/projection'
import type { LiftNote } from '../shacl/lift'
import { ARUNA_PROFILE_PREFIX, isDatasetType, isRecord, normalizeTypeUri, termNameFromUri } from './uri'
import {
  DX_HAS_ARTIFACT,
  DX_HAS_RESOURCE,
  DX_HAS_ROLE,
  DX_PROFILE,
  DX_RESOURCE_DESCRIPTOR,
  DX_ROLE_CONSTRAINTS,
  DX_ROLE_GUIDANCE,
  DX_ROLE_SCHEMA,
  DX_ROLE_SPECIFICATION,
  JSON_SCHEMA_DRAFT_2020_12,
  RO_CRATE_PROFILE,
  SHACL_NS,
  type JsonSchema,
  type ParsedProfileCrate,
  type ProfileBasics,
  type ProfileEntityRule,
  type ProfilePropertyRule,
} from './types'

// One externalized artifact: the File entity's `@id` is the content-addressed
// DRS id (https://w3id.org/aruna/data/<blake3-hex>, resolvable through any
// node's GA4GH DRS API), `contentUrl` is the directly fetchable path-style S3
// URL, and `sha256` uses the RO-Crate 1.2 checksum term.
export interface ExternalArtifactRef {
  id: string
  contentUrl: string
  contentSize: number
  sha256: string
}

export interface ExternalProfileArtifacts {
  html: ExternalArtifactRef
  schema: ExternalArtifactRef
  mode: ExternalArtifactRef
  shapes: ExternalArtifactRef
}

export interface BuildProfileCrateInput extends ProfileBasics {
  entityRules: ProfileEntityRule[]
  importedMode?: ModeFile
  // Imported expert SHACL source, preserved inside the unified shapes.ttl after
  // the shapes generated from editable rules.
  customShapesText?: string
  // When set, the artifact content lives on S3 (public profiles) and the File
  // entities reference it instead of embedding `text`. Private profiles keep
  // the embedded form so nothing private ever depends on a public bucket.
  externalArtifacts?: ExternalProfileArtifacts
}

// The exact artifact texts buildProfileCrate embeds (or, for public profiles,
// the publish flow uploads to S3 before emitting the crate). Kept as one
// function so the uploaded bytes and the crate emitter can never drift.
export interface ProfileArtifactTexts {
  html: string
  schema: string
  mode: string
  shapes: string
}

export interface ParsedProfileControls extends ParsedProfileCrate {
  liftNotes: LiftNote[]
}

const PRESERVED_SHAPES_MARKER = '# ARUNA-PRESERVED-SHAPES '
const PRESERVED_SHAPES_END = '# END ARUNA-PRESERVED-SHAPES'

function combinedShapesText(generated: string, preserved: string | undefined): string {
  if (!preserved?.trim()) return generated
  return `${generated.trimEnd()}\n\n${PRESERVED_SHAPES_MARKER}${preserved.length}\n${preserved}${preserved.endsWith('\n') ? '' : '\n'}${PRESERVED_SHAPES_END}\n`
}

export function buildProfileArtifactTexts(input: BuildProfileCrateInput): ProfileArtifactTexts {
  const entities = normalizeEntityRules(input.entityRules)
  const schema = schemaFromEntityRules(input, entities)
  const mode = entityRulesToMode(input, entities, input.importedMode)
  return {
    html: profileHtml(input, entities),
    schema: JSON.stringify(schema, null, 2),
    mode: JSON.stringify(mode, null, 2),
    shapes: combinedShapesText(shapesFromEntityRules(input, entities), input.customShapesText),
  }
}

// A thin wrapper crate that references the mode file: descriptor + root + four
// File artifacts (profile.html / schema.json / mode.json / shapes.ttl) + four DX-PROF
// ResourceDescriptors + a license contextual entity + DefinedTerm definitions
// for minted custom terms. The machine-readable rules live in mode.json; the
// human-readable RFC-2119 wording lives in profile.html; scalar validation lives
// in schema.json.
export function buildProfileCrate(input: BuildProfileCrateInput): Record<string, unknown> {
  const entities = normalizeEntityRules(input.entityRules)
  const schema = schemaFromEntityRules(input, entities)
  const mode = entityRulesToMode(input, entities, input.importedMode)
  const shapes = combinedShapesText(shapesFromEntityRules(input, entities), input.customShapesText)
  const context = buildProfileContext(entities)
  const definitions = mintedTermDefinitions(entities)
  const external = input.externalArtifacts
  const htmlId = external?.html.id ?? 'profile.html'
  const schemaId = external?.schema.id ?? 'schema.json'
  const modeId = external?.mode.id ?? 'mode.json'
  const shapesId = external?.shapes.id ?? 'shapes.ttl'

  return {
    '@context': context,
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': RO_CRATE_PROFILE },
        about: { '@id': './' },
      },
      {
        '@id': './',
        '@type': ['Dataset', DX_PROFILE],
        name: input.name,
        description: input.description,
        // datePublished / license are omitted when empty rather than fabricated,
        // so a best-effort rebuild (ProfilesView download fallback, L9) does not
        // invent a publication date or license it cannot know.
        ...(input.datePublished ? { datePublished: input.datePublished } : {}),
        ...(input.license ? { license: { '@id': input.license } } : {}),
        version: input.version || undefined,
        isProfileOf: { '@id': RO_CRATE_PROFILE },
        hasPart: [
          { '@id': htmlId },
          { '@id': schemaId },
          { '@id': modeId },
          { '@id': shapesId },
        ],
        // Minted term definitions must be reachable from the root: craqle's
        // export prunes contextual entities nothing links to, and @context
        // mappings alone create no graph edge.
        ...(definitions.length
          ? { mentions: definitions.map((definition) => ({ '@id': definition['@id'] as string })) }
          : {}),
        [DX_HAS_RESOURCE]: [
          { '@id': '#profile-resource' },
          { '@id': '#schema-resource' },
          { '@id': '#mode-resource' },
          { '@id': '#shapes-resource' },
        ],
      },
      {
        '@id': htmlId,
        '@type': 'File',
        name: `${input.name} Profile Description`,
        encodingFormat: 'text/html',
        about: { '@id': './' },
        ...(external ? externalFileProps(external.html) : { text: profileHtml(input, entities) }),
      },
      {
        '@id': schemaId,
        '@type': 'File',
        name: `${input.name} JSON Schema`,
        encodingFormat: 'application/schema+json',
        conformsTo: { '@id': JSON_SCHEMA_DRAFT_2020_12 },
        ...(external ? externalFileProps(external.schema) : { text: JSON.stringify(schema, null, 2) }),
      },
      {
        '@id': modeId,
        '@type': 'File',
        name: `${input.name} Editor Mode File`,
        encodingFormat: 'application/json',
        about: { '@id': './' },
        ...(external ? externalFileProps(external.mode) : { text: JSON.stringify(mode, null, 2) }),
      },
      {
        '@id': shapesId,
        '@type': 'File',
        name: `${input.name} SHACL Shapes`,
        encodingFormat: 'text/turtle',
        conformsTo: { '@id': SHACL_NS },
        ...(external ? externalFileProps(external.shapes) : { text: shapes }),
      },
      {
        '@id': '#profile-resource',
        '@type': DX_RESOURCE_DESCRIPTOR,
        [DX_HAS_ROLE]: { '@id': DX_ROLE_SPECIFICATION },
        [DX_HAS_ARTIFACT]: { '@id': htmlId },
      },
      {
        '@id': '#schema-resource',
        '@type': DX_RESOURCE_DESCRIPTOR,
        [DX_HAS_ROLE]: { '@id': DX_ROLE_SCHEMA },
        [DX_HAS_ARTIFACT]: { '@id': schemaId },
      },
      {
        // The mode file is editor guidance, not a formal validation artifact, so
        // it takes the DX-PROF `guidance` role (a documented judgment call: the
        // vocabulary has no dedicated "form definition" role).
        '@id': '#mode-resource',
        '@type': DX_RESOURCE_DESCRIPTOR,
        [DX_HAS_ROLE]: { '@id': DX_ROLE_GUIDANCE },
        [DX_HAS_ARTIFACT]: { '@id': modeId },
      },
      {
        '@id': '#shapes-resource',
        '@type': DX_RESOURCE_DESCRIPTOR,
        [DX_HAS_ROLE]: { '@id': DX_ROLE_CONSTRAINTS },
        [DX_HAS_ARTIFACT]: { '@id': shapesId },
      },
      ...(input.license ? [licenseEntity(input.license)] : []),
      ...definitions,
    ],
  }
}

// sha256 is an RO-Crate 1.2 context term; contentUrl/contentSize are schema.org.
function externalFileProps(ref: ExternalArtifactRef): Record<string, unknown> {
  return { contentUrl: ref.contentUrl, contentSize: String(ref.contentSize), sha256: ref.sha256 }
}

export function parseProfileCrate(rocrate: unknown): ParsedProfileCrate {
  const entries = graph(rocrate)
  const root = profileRoot(entries)
  const mode = extractProfileMode(rocrate)
  const schema = extractProfileSchema(rocrate)
  const entityRules = mode ? modeToEntityRules(mode, schema) : []
  const datasetPropertyRules = entityRules.find((entity) => isDatasetType(entity.type))?.propertyRules ?? []
  const contextTerms = contextTermsFromCrate(rocrate, mode)
  const { shapesText, customShapesText } = extractShapesTexts(rocrate)
  // A SHACL-only crate has no mode rules to regenerate its source constraints.
  // Keep that source attached when the crate is imported and saved again, so
  // constraints that cannot become controls remain available to validation.
  const liftableShapesText = shapesText ?? (!entityRules.length ? customShapesText : undefined)
  const retainedShapesText = customShapesText !== liftableShapesText ? customShapesText : undefined
  const artifactUrl = publishedArtifactUrl(entries)
  return {
    ...(liftableShapesText ? { shapesText: liftableShapesText } : {}),
    ...(retainedShapesText ? { customShapesText: retainedShapesText } : {}),
    ...(artifactUrl ? { artifactUrl } : {}),
    name: textValue(root?.name) || (mode?.metadata?.name ? String(mode.metadata.name) : '') || schema?.title || '',
    description:
      textValue(root?.description) ||
      (mode?.metadata?.description ? String(mode.metadata.description) : '') ||
      schema?.description ||
      '',
    version: textValue(root?.version) || (mode?.metadata?.version !== undefined ? String(mode.metadata.version) : '') || undefined,
    datePublished: textValue(root?.datePublished) || undefined,
    license: idValue(root?.license) || textValue(root?.license) || undefined,
    schema,
    mode,
    ...(contextTerms ? { contextTerms } : {}),
    entityRules,
    datasetPropertyRules,
  }
}

// Stored profiles use the same lazy SHACL lift as the import UI. Mode-derived
// rules remain authoritative when present; otherwise every supported SHACL
// constraint becomes a control, while lift notes describe the retained source
// constraints that have no complete control representation.
export async function parseProfileCrateForControls(rocrate: unknown): Promise<ParsedProfileControls> {
  const parsed = parseProfileCrate(rocrate)
  const shapeTexts = [...new Set([parsed.shapesText, parsed.customShapesText].filter(
    (text): text is string => Boolean(text?.trim()),
  ))]
  if (!shapeTexts.length) return { ...parsed, liftNotes: [] }

  const { liftShapes } = await import('../shacl/lift')
  const lifted = liftShapes(parsed.shapesText ?? shapeTexts[0])
  const liftNotes = shapeTexts.length === 1 ? lifted.notes : liftShapes(shapeTexts.join('\n\n')).notes
  if (parsed.entityRules.length) return { ...parsed, liftNotes }

  const entityRules = lifted.entities
  return {
    ...parsed,
    entityRules,
    datasetPropertyRules: entityRules.find((entity) => isDatasetType(entity.type))?.propertyRules ?? [],
    liftNotes,
  }
}

// Externalized profile crates (public profiles) reference their artifacts by
// DRS id + contentUrl instead of embedding `text`. Fetch the referenced content
// and return a crate copy whose artifact entities carry the text inline, so the
// synchronous parser keeps working unchanged. Crates with embedded text (old or
// private profiles) pass through untouched. Only entities referenced by a
// DX-PROF ResourceDescriptor are fetched. A dataset crate's data files never
// qualify. Throws when a referenced artifact cannot be fetched.
// `baseUrl` is the location the crate itself was read from. A crate authored as
// a directory names its artifacts by crate-relative path ("constraints/x.ttl"),
// which is only fetchable when that location is known; an uploaded file has none,
// so those artifacts stay unresolved and the caller reports which are missing.
export async function resolveProfileArtifacts(
  rocrate: unknown,
  fetchText: (url: string) => Promise<string> = fetchArtifactText,
  baseUrl?: string,
): Promise<unknown> {
  const entries = graph(rocrate)
  const artifactIds = new Set<string>()
  for (const descriptor of entries) {
    if (!typeContains(descriptor, DX_RESOURCE_DESCRIPTOR)) continue
    for (const id of idValues(descriptor[DX_HAS_ARTIFACT] ?? descriptor.hasArtifact)) artifactIds.add(id)
  }

  const pending: Array<{ id: string; url: string; required: boolean }> = []
  for (const id of artifactIds) {
    const entity = entityById(entries, id)
    if (!entity || typeof entity.text === 'string' || isRecord(entity.text)) continue
    const resolved = artifactFetchUrl(entity, baseUrl)
    if (resolved) pending.push({ id, ...resolved })
  }
  if (!pending.length) return rocrate

  // An artifact the crate addresses directly must resolve: a published profile
  // is incomplete without it. One found only by resolving a relative path against
  // the crate's location is best effort: a directory crate lists its prose and
  // licence files too, and a missing or CORS-blocked one of those must not stop
  // the rules being read.
  const texts = await Promise.all(pending.map(async (item) => {
    if (item.required) return { ...item, text: await fetchText(item.url) }
    try {
      return { ...item, text: await fetchText(item.url) }
    } catch {
      return { ...item, text: undefined }
    }
  }))

  const copy = JSON.parse(JSON.stringify(rocrate)) as Record<string, unknown>
  const copyEntries = graph(copy)
  for (const item of texts) {
    if (item.text === undefined) continue
    const entity = entityById(copyEntries, item.id)
    if (entity) entity.text = item.text
  }
  return copy
}

// The S3 contentUrl of any descriptor-referenced artifact of a PUBLISHED
// (externalized) profile. All artifacts are written side by side, so one URL
// pins the whole published location; embedded (private) profiles yield none.
function publishedArtifactUrl(entries: Array<Record<string, unknown>>): string | undefined {
  for (const descriptor of entries) {
    if (!typeContains(descriptor, DX_RESOURCE_DESCRIPTOR)) continue
    for (const id of idValues(descriptor[DX_HAS_ARTIFACT] ?? descriptor.hasArtifact)) {
      const entity = entityById(entries, id)
      const url = entity && (idValue(entity.contentUrl) || textValue(entity.contentUrl))
      if (url && /^https?:\/\//.test(url)) return url
    }
  }
  return undefined
}

// contentUrl (the S3 https URL) first, a fetchable absolute @id second, and a
// crate-relative @id resolved against the crate's own location last. `required`
// marks the first two: an address the crate states itself, whose failure is a
// real error rather than a file the crate merely sits next to.
function artifactFetchUrl(
  entity: Record<string, unknown>,
  baseUrl?: string,
): { url: string; required: boolean } | undefined {
  const contentUrl = idValue(entity.contentUrl) || textValue(entity.contentUrl)
  if (/^https?:\/\//.test(contentUrl)) return { url: contentUrl, required: true }
  const id = typeof entity['@id'] === 'string' ? entity['@id'] : ''
  if (/^https?:\/\//.test(id)) return { url: id, required: true }
  const relative = id && baseUrl ? relativeArtifactUrl(id, baseUrl) : undefined
  return relative ? { url: relative, required: false } : undefined
}

// A crate-relative artifact path against the URL the crate was read from. Only
// http(s) bases resolve: a relative id under any other scheme is not fetchable.
function relativeArtifactUrl(id: string, baseUrl: string): string | undefined {
  if (id.startsWith('#') || !/^https?:\/\//.test(baseUrl)) return undefined
  try {
    return new URL(id, baseUrl).toString()
  } catch {
    return undefined
  }
}

// Published artifacts keep their contentUrl across profile updates, so the
// HTTP cache must revalidate instead of serving a heuristically fresh copy.
async function fetchArtifactText(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Fetching profile artifact failed (${response.status} ${response.statusText}): ${url}`)
  return await response.text()
}

// The SHACL artifact's Turtle text, split back into its generated and preserved
// sections so re-editing can regenerate the former without duplicating the latter.
// The DX-PROF roles a SHACL artifact is published under: the portal writes
// `constraints`, and the vocabulary's own term for the same thing is
// `validation`, which is what externally authored profile crates use.
function isShapesRole(role: string): boolean {
  return role.includes('/constraints') || role.includes('/validation')
}

export function extractShapesTexts(rocrate: unknown): { shapesText?: string; customShapesText?: string } {
  const entries = graph(rocrate)
  const candidates: Array<Record<string, unknown>> = []
  for (const descriptor of entries) {
    if (!typeContains(descriptor, DX_RESOURCE_DESCRIPTOR)) continue
    const roles = idValues(descriptor[DX_HAS_ROLE] ?? descriptor.hasRole)
    if (!roles.some(isShapesRole)) continue
    const artifactRef = idValues(descriptor[DX_HAS_ARTIFACT] ?? descriptor.hasArtifact)[0]
    const artifact = artifactRef ? entityById(entries, artifactRef) : undefined
    if (artifact) candidates.push(artifact)
  }
  if (!candidates.length) {
    candidates.push(...entries.filter((entry) => textValue(entry.encodingFormat).includes('text/turtle')))
  }

  let shapesText: string | undefined
  let customShapesText: string | undefined
  for (const artifact of candidates) {
    const text = artifact.text
    if (typeof text !== 'string' || !text.trim()) continue
    const isCustom =
      idMatches(artifact['@id'], 'shapes.custom.ttl') || idMatches(idValue(artifact.contentUrl), 'shapes.custom.ttl')
    if (isCustom) customShapesText ??= text
    else {
      const split = splitCombinedShapesText(text)
      shapesText ??= split.shapesText
      customShapesText ??= split.customShapesText
    }
  }
  return { shapesText, customShapesText }
}

// Ids of SHACL artifacts the crate names but whose content is not available: a
// crate authored as a directory references its shapes by relative path, which is
// unfetchable from a single uploaded ro-crate-metadata.json. Reported so the
// import says which file is missing instead of silently generating no fields.
export function missingShapesArtifacts(rocrate: unknown): string[] {
  const entries = graph(rocrate)
  const missing: string[] = []
  for (const descriptor of entries) {
    if (!typeContains(descriptor, DX_RESOURCE_DESCRIPTOR)) continue
    if (!idValues(descriptor[DX_HAS_ROLE] ?? descriptor.hasRole).some(isShapesRole)) continue
    for (const id of idValues(descriptor[DX_HAS_ARTIFACT] ?? descriptor.hasArtifact)) {
      const artifact = entityById(entries, id)
      if (artifact && typeof artifact.text === 'string' && artifact.text.trim()) continue
      if (!missing.includes(id)) missing.push(id)
    }
  }
  return missing
}

function splitCombinedShapesText(text: string): { shapesText: string; customShapesText?: string } {
  const marker = text.indexOf(PRESERVED_SHAPES_MARKER)
  if (marker < 0) return { shapesText: text }
  const lineEnd = text.indexOf('\n', marker)
  const length = Number.parseInt(text.slice(marker + PRESERVED_SHAPES_MARKER.length, lineEnd), 10)
  const sourceStart = lineEnd + 1
  if (lineEnd < 0 || !Number.isSafeInteger(length) || length < 0 || sourceStart + length > text.length) {
    return { shapesText: text }
  }
  return {
    shapesText: `${text.slice(0, marker).trimEnd()}\n`,
    customShapesText: text.slice(sourceStart, sourceStart + length),
  }
}

export function extractProfileSchema(rocrate: unknown): JsonSchema | undefined {
  const entries = graph(rocrate)
  const artifact = artifactByRole(entries, (role) => role.includes('/schema'))
  const roleSchema = parseSchemaText(artifact?.text)
  if (roleSchema) return roleSchema

  const schemaEntity = entries.find((entry) => textValue(entry.encodingFormat).includes('application/schema+json'))
  return parseSchemaText(schemaEntity?.text)
}

// Locate the mode.json artifact by ResourceDescriptor guidance role, then by
// `@id` suffix (`mode.json`), then by `application/json` encoding. The suffix is
// tried before the encoding so a foreign JSON File in the crate cannot shadow the
// real mode.json. Its `text` is a JSON string (embedded), but an absolute `@id`
// (a future served artifact) is accepted too.
function extractProfileMode(rocrate: unknown): ModeFile | undefined {
  const entries = graph(rocrate)
  const byRole = artifactByRole(entries, (role) => role.includes('/guidance'))
  const bySuffix = entries.find((entry) => idMatches(entry['@id'], 'mode.json'))
  // Externalized artifacts carry a DRS id as @id; their S3 contentUrl still
  // ends in mode.json, so it locates the entity when descriptors were pruned.
  const byContentUrl = entries.find((entry) => idMatches(idValue(entry.contentUrl), 'mode.json'))
  const byEncoding = entries.find((entry) => textValue(entry.encodingFormat).includes('application/json'))
  for (const artifact of [byRole, bySuffix, byContentUrl, byEncoding]) {
    const mode = modeFromArtifact(artifact)
    if (mode) return mode
  }
  return undefined
}

function modeFromArtifact(artifact: Record<string, unknown> | undefined): ModeFile | undefined {
  if (!artifact) return undefined
  const text = artifact.text
  if (typeof text === 'string') {
    try {
      const parsed = JSON.parse(text)
      if (isModeFile(parsed)) return parsed
    } catch {
      return undefined
    }
  }
  if (isModeFile(text)) return text
  return undefined
}

function artifactByRole(
  entries: Array<Record<string, unknown>>,
  matches: (role: string) => boolean,
): Record<string, unknown> | undefined {
  for (const descriptor of entries) {
    if (!typeContains(descriptor, DX_RESOURCE_DESCRIPTOR)) continue
    const roles = idValues(descriptor[DX_HAS_ROLE] ?? descriptor.hasRole)
    if (!roles.some(matches)) continue
    const artifactRef = idValues(descriptor[DX_HAS_ARTIFACT] ?? descriptor.hasArtifact)[0]
    const artifact = artifactRef ? entityById(entries, artifactRef) : undefined
    if (artifact) return artifact
  }
  return undefined
}

// Recover term -> URI mappings from the crate `@context` array form and/or the
// mode file's own context, so consumers can resolve custom terms. The mode
// context is the durable source: craqle's export replaces the crate `@context`
// with the bare reference URL, but mode.json text survives verbatim. A mapping
// is skipped only when the base RO-Crate context already provides it: a
// schema.org URI whose local name IS the term. An alias term over a schema.org
// URI (e.g. `Author` -> schema.org/Person) must be kept: emitted dataset crates
// use the alias as `@type` (entityTypeName in NewDatasetDialog emits the
// className), and the base context does not define it.
function contextTermsFromCrate(rocrate: unknown, mode: ModeFile | undefined): Record<string, string> | undefined {
  const collected: Record<string, string> = {}
  collectContextObjects(isRecord(rocrate) ? rocrate['@context'] : undefined, collected)
  collectContextObjects(mode?.context, collected)
  const terms = contextTermsOf([collected])
  return Object.keys(terms).length ? terms : undefined
}

function normalizeEntityRules(entityRules: ProfileEntityRule[]): ProfileEntityRule[] {
  return entityRules.map((entity, entityIndex) => {
    const id = safeIdSegment(entity.id || entity.label || `entity-${entityIndex + 1}`)
    const type = normalizeTypeUri(entity.type || 'Dataset')
    return {
      ...entity,
      id,
      type,
      // Default an empty className (D3) from the normalized type, so a fresh
      // builder-created entity keys mode.classes / schema $defs / context exactly
      // as before; an imported alias is preserved because it is already set.
      className: entity.className || termNameFromUri(type),
      propertyRules: entity.propertyRules.map((rule, ruleIndex) => normalizePropertyRule(rule, ruleIndex)),
    }
  })
}

function normalizePropertyRule(rule: ProfilePropertyRule, index: number): ProfilePropertyRule {
  const valueName = rule.valueName || safeIdSegment(rule.id || rule.label)
  return {
    ...rule,
    id: safeIdSegment(rule.id || rule.valueName || rule.label || `property-${index + 1}`),
    valueName,
    propertyUri: rule.propertyUri || `http://schema.org/${valueName}`,
    obligation: rule.obligation ?? 'MAY',
  }
}

// DefinedTerm definitions for minted custom terms only (propertyUri under the
// aruna profiles namespace). Schema.org and external-ontology terms resolve at
// their source, so they get no in-graph definition.
function mintedTermDefinitions(entities: ProfileEntityRule[]): Record<string, unknown>[] {
  const definitions = new Map<string, Record<string, unknown>>()
  for (const entity of entities) {
    for (const rule of entity.propertyRules) {
      if (!rule.propertyUri.startsWith(ARUNA_PROFILE_PREFIX) || definitions.has(rule.propertyUri)) continue
      definitions.set(rule.propertyUri, {
        '@id': rule.propertyUri,
        '@type': 'DefinedTerm',
        termCode: rule.valueName,
        name: rule.label || rule.valueName,
        ...(rule.description ? { description: rule.description } : {}),
      })
    }
  }
  return [...definitions.values()]
}

// Common Creative Commons licences get a curated name/description; anything else
// falls back to the URL as its own name so the reference still resolves.
// Shared with dataset crate emission (NewDatasetDialog), so both crate kinds
// describe the same license identically.
export function licenseEntity(license: string): Record<string, unknown> {
  const curated = CC_LICENSES[license.replace(/\/$/, '')]
  return {
    '@id': license,
    '@type': 'CreativeWork',
    name: curated?.name ?? license,
    ...(curated?.description ? { description: curated.description } : {}),
  }
}

const CC_LICENSES: Record<string, { name: string; description: string }> = {
  'https://creativecommons.org/licenses/by/4.0': {
    name: 'Creative Commons Attribution 4.0 International',
    description: 'CC BY 4.0, reuse with attribution.',
  },
  'https://creativecommons.org/licenses/by-sa/4.0': {
    name: 'Creative Commons Attribution-ShareAlike 4.0 International',
    description: 'CC BY-SA 4.0, reuse with attribution under the same terms.',
  },
  'https://creativecommons.org/licenses/by-nc/4.0': {
    name: 'Creative Commons Attribution-NonCommercial 4.0 International',
    description: 'CC BY-NC 4.0, non-commercial reuse with attribution.',
  },
  'https://creativecommons.org/publicdomain/zero/1.0': {
    name: 'Creative Commons CC0 1.0 Universal',
    description: 'CC0 1.0, dedicated to the public domain.',
  },
}

function profileHtml(profile: ProfileBasics, entities: ProfileEntityRule[]): string {
  const sections = entities
    .map((entity) => {
      const rows = entity.propertyRules
        .map((rule) => {
          const verb = rule.obligation
          const target =
            rule.kind === 'entity' && rule.entityTypes?.length
              ? ` referencing ${rule.entityTypes.map((type) => escapeHtml(termNameFromUri(type))).join(' or ')}`
              : ''
          const detail = rule.description ? `, ${escapeHtml(rule.description)}` : ''
          return `<li>${escapeHtml(entity.label)} entities ${verb} provide <strong>${escapeHtml(rule.label)}</strong> (<code>${escapeHtml(rule.valueName)}</code>)${target}${detail}.${ruleConstraintHtml(rule)}</li>`
        })
        .join('')
      return `<section><h3>${escapeHtml(entity.label)} <small>(${escapeHtml(entity.type)})</small></h3><ul>${rows}</ul></section>`
    })
    .join('')
  return `<h1>${escapeHtml(profile.name)}</h1><p>${escapeHtml(profile.description)}</p><h2>RO-Crate rules</h2>${sections}`
}

// Human-readable lines for the machine constraints: list cardinality, reference
// mode, allowed URL sets, required instances. Returns '' for rules that set none,
// so legacy-shaped profiles emit byte-identical profile.html (invariant 3).
function ruleConstraintHtml(rule: ProfilePropertyRule): string {
  const notes: string[] = []
  if (rule.minItems !== undefined && rule.maxItems !== undefined) notes.push(`between ${rule.minItems} and ${rule.maxItems} entries`)
  else if (rule.minItems !== undefined) notes.push(`at least ${rule.minItems} ${rule.minItems === 1 ? 'entry' : 'entries'}`)
  else if (rule.maxItems !== undefined) notes.push(`at most ${rule.maxItems} ${rule.maxItems === 1 ? 'entry' : 'entries'}`)
  if (rule.kind === 'entity' && rule.entitySources?.length) {
    // Only non-default policies note themselves, so legacy-shaped (inline-only)
    // profiles keep emitting byte-identical profile.html.
    const phrases: string[] = []
    for (const source of effectiveEntitySources(rule.entitySources)) {
      if (source === 'new') phrases.push('describing a new entity')
      else if (source === 'existing-external') phrases.push('an external URI')
      else phrases.push('an entity in this RO-Crate')
    }
    notes.push(`fulfilled by ${phrases.join(' or ')}`)
  }
  if (rule.kind === 'select-url') {
    const options = (rule.valueOptions ?? []).filter((value): value is string => typeof value === 'string')
    if (options.length) notes.push(`chosen from: ${options.map((value) => escapeHtml(value)).join(', ')}`)
  }
  let html = notes.length ? ` <em>(${notes.join('; ')})</em>` : ''
  const instances = (rule.requiredInstances ?? []).filter((instance) => instance.name || instance.id)
  if (instances.length) {
    const items = instances
      .map((instance) => {
        const match = instance.id
          ? `with @id <code>${escapeHtml(instance.id)}</code>`
          : `named <strong>${escapeHtml(instance.name ?? '')}</strong>`
        const hint = instance.hint ? `, ${escapeHtml(instance.hint)}` : ''
        return `<li>${rule.obligation} contain an entry ${match}${hint}; more are allowed.</li>`
      })
      .join('')
    html += `<ul>${items}</ul>`
  }
  return html
}

function profileRoot(entries: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  const metadata = entries.find((entry) => idMatches(entry['@id'], 'ro-crate-metadata.json'))
  const about = idValues(metadata?.about)[0]
  if (about) {
    const root = entityById(entries, about)
    if (root) return root
  }
  return (
    entries.find((entry) => typeContains(entry, DX_PROFILE) && typeContains(entry, 'Dataset')) ??
    entries.find((entry) => idMatches(entry['@id'], './') && typeContains(entry, 'Dataset')) ??
    entries.find((entry) => typeContains(entry, 'Dataset'))
  )
}

export function safeIdSegment(value: string): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'field'
}

function graph(value: unknown): Array<Record<string, unknown>> {
  if (!isRecord(value)) return []
  const graphValue = value['@graph']
  return Array.isArray(graphValue) ? graphValue.filter(isRecord) : []
}

function entityById(entries: Array<Record<string, unknown>>, id: string): Record<string, unknown> | undefined {
  return entries.find((entry) => idMatches(entry['@id'], id))
}

function idMatches(value: unknown, id: string): boolean {
  if (typeof value !== 'string') return false
  return value === id || value.endsWith(id)
}

// Matches whichever way round the crate wrote the type: an expanded IRI against
// a compact expectation ("Dataset"), and a COMPACT `@type` against an expanded
// one. Externally authored crates map the DX-PROF terms in their `@context` and
// write `"@type": "ResourceDescriptor"`, which an IRI-only test never matched.
function typeContains(entity: Record<string, unknown>, expected: string): boolean {
  return idValues(entity['@type']).some(
    (type) => type === expected || type.endsWith(expected) || expected.endsWith(`/${type}`),
  )
}

function idValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(idValues)
  if (isRecord(value)) return idValues(value['@id'] ?? value.id ?? value.name)
  return []
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return textValue(value[0])
  if (isRecord(value)) return textValue(value['@value'] ?? value.name ?? value['@id'] ?? value.id)
  return ''
}

function idValue(value: unknown): string {
  return idValues(value)[0] ?? ''
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
