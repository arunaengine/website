import { normalizeProfileValues } from './controls'
import { isAbsoluteUri, isRecord, sameSchemaOrgType, SCHEMA_ORG } from './uri'
import type { EntityEntry, EntrySourcePolicy } from './entityEntries'
import { effectiveEntryRef } from './entityEntries'
import type { ProfileControl } from './types'

// Emission helpers for profile-driven dataset crates, shared with
// NewDatasetDialog.buildRoCrate: entity instances and select-object choices
// become flattened contextual entities plus {"@id"} references. They live in
// the lib — not the dialog component — so the newer emission paths (notably a
// NESTED multiple select-object inside an entity instance) stay unit-testable.

// Registers a flattened contextual entity on the crate graph. The caller owns
// deduplication by @id (see NewDatasetDialog.addEntity: first wins, missing
// props merged).
export type AddEntity = (entity: Record<string, unknown>) => void

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/^-|-$/g, '')
}

export function uniqueId(base: string, used: Set<string>): string {
  let candidate = base
  let counter = 2
  while (used.has(candidate)) candidate = `${base}-${counter++}`
  used.add(candidate)
  return candidate
}

// One entity instance → a flattened contextual entity. @id: an identifier value
// that is an absolute URI (e.g. an ORCID) becomes the @id; otherwise a
// uniquified `#<type-slug>-<slug(name|index)>`. Nested entity references (depth
// 1) emit as {"@id": uri} from their URI string.
export function buildEntityInstance(
  instance: Record<string, unknown>,
  subControls: ProfileControl[],
  typeName: string,
  typeLabel: string,
  index: number,
  usedSyntheticIds: Set<string>,
  addEntity: AddEntity,
): Record<string, unknown> {
  // Entity refs and select-object choices are references, not scalars; both are
  // handled by the reference branches below. Excluding them here keeps this path
  // independent of normalizeProfileValues' own skip of the same kinds.
  const scalarControls = subControls.filter(
    (control) => control.control !== 'entity' && control.control !== 'select-object',
  )
  const props = normalizeProfileValues(instance, scalarControls, { omitEmpty: true })
  for (const control of subControls) {
    if (control.control === 'entity') {
      // Depth-1 nested reference(s): a URI string → {"@id"}, or an array of URIs →
      // an array of {"@id"} when the sub-control is `multiple` (D5).
      const raw = instance[control.property]
      if (control.multiple) {
        const refs = (Array.isArray(raw) ? raw : [])
          .map((entry) => String(entry).trim())
          .filter(Boolean)
          .map((uri) => ({ '@id': uri }))
        if (refs.length) props[control.property] = refs
      } else if (typeof raw === 'string' && raw.trim()) {
        props[control.property] = { '@id': raw.trim() }
      }
    } else if (control.control === 'select-object') {
      // The chosen option(s) are emitted verbatim as contextual entities +
      // {"@id"} ref(s) — an array of refs when the sub-control is `multiple`.
      const ref = emitSelectObject(control, instance[control.property], addEntity)
      if (ref) props[control.property] = ref
    }
  }

  const identifierValue = instance.identifier
  let id: string
  if (typeof identifierValue === 'string' && isAbsoluteUri(identifierValue.trim())) {
    id = identifierValue.trim()
  } else {
    const nameForSlug = typeof props.name === 'string' ? props.name : firstStringValue(props)
    id = uniqueId(`#${slugify(typeLabel) || 'entity'}-${slugify(nameForSlug) || String(index + 1)}`, usedSyntheticIds)
  }
  return { '@id': id, '@type': typeName, ...props }
}

// The chosen select-object option(s) (identified by the stored `@id`) emitted as
// flattened contextual entities via addEntity (deduped by @id), with {"@id"}
// reference(s) returned for the owning property: an array of refs when the
// control is `multiple` (the checkbox-list value), a single ref otherwise.
// Returns undefined when nothing is chosen. Each option is added only when it is
// still resolvable in the control's valueOptions; the {"@id"} reference is
// emitted regardless so the property never dangles.
export function emitSelectObject(
  control: ProfileControl,
  chosen: unknown,
  addEntity: AddEntity,
): { '@id': string } | Array<{ '@id': string }> | undefined {
  if (control.multiple) {
    const ids = [...new Set(
      (Array.isArray(chosen) ? chosen : [chosen])
        .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry) => entry.trim()),
    )]
    if (!ids.length) return undefined
    return ids.map((id) => selectObjectRef(control, id, addEntity))
  }
  if (typeof chosen !== 'string' || !chosen.trim()) return undefined
  return selectObjectRef(control, chosen.trim(), addEntity)
}

// One chosen option @id → contextual entity (when still resolvable) + {"@id"} ref.
function selectObjectRef(
  control: ProfileControl,
  id: string,
  addEntity: AddEntity,
): { '@id': string } {
  const option = (control.valueOptions ?? []).find(
    (opt) => isRecord(opt) && typeof opt['@id'] === 'string' && opt['@id'].trim() === id,
  )
  if (isRecord(option)) addEntity(flattenGraphObject(option, addEntity))
  return { '@id': id }
}

// Shallow-flatten a select-object option into flat-graph shape (H6). Clones the
// option first, so graph merging never mutates the live control.valueOptions state
// by reference (H8). For each top-level property that is a nested record — or an
// array of records — nested records WITH an '@id' are hoisted as their own
// contextual entities (cloned) and replaced with {"@id"} references; nested records
// WITHOUT an '@id' are DROPPED from the emitted entity (they cannot be referenced,
// and stay untouched inside the profile's mode.json). Scalars and non-record array
// items pass through unchanged.
function flattenGraphObject(
  source: Record<string, unknown>,
  addEntity: AddEntity,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === '@id' || key === '@type') {
      flat[key] = value
    } else if (isRecord(value)) {
      if (typeof value['@id'] === 'string') {
        addEntity({ ...value })
        flat[key] = { '@id': value['@id'] }
      }
    } else if (Array.isArray(value)) {
      const out: unknown[] = []
      for (const item of value) {
        if (isRecord(item)) {
          if (typeof item['@id'] === 'string') {
            addEntity({ ...item })
            out.push({ '@id': item['@id'] })
          }
        } else {
          out.push(item)
        }
      }
      if (out.length) flat[key] = out
    } else {
      flat[key] = value
    }
  }
  return flat
}

function firstStringValue(props: Record<string, unknown>): string {
  for (const value of Object.values(props)) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

// One entity control's combined reuse-or-create entries → the {"@id"}
// reference list for the owning dataset property (plan Phase 4). Described-new
// entries flatten through buildEntityInstance into contextual entities (added
// via addEntity, which dedupes by @id across the whole crate); reuse entries
// contribute a bare {"@id"} with NO inline entity. Repeated @ids within the
// property are deduped order-preserving, so a reuse reference pointing at the
// same @id an instance produced (or two identical reuse rows) emits once.
// Blank/stale reuse refs contribute nothing (effectiveEntryRef).
export function emitEntityEntries(
  entries: EntityEntry[],
  policy: EntrySourcePolicy,
  validCrateIds: ReadonlySet<string>,
  subControls: ProfileControl[],
  typeName: string,
  typeLabel: string,
  usedSyntheticIds: Set<string>,
  addEntity: AddEntity,
): Array<{ '@id': string }> {
  const refs: Array<{ '@id': string }> = []
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    let id: string
    if (entry.source === 'new') {
      const entity = buildEntityInstance(entry.instance ?? {}, subControls, typeName, typeLabel, index, usedSyntheticIds, addEntity)
      addEntity(entity)
      id = String(entity['@id'])
    } else {
      id = effectiveEntryRef(entry, policy, validCrateIds)
      if (!id) return
    }
    if (seen.has(id)) return
    seen.add(id)
    refs.push({ '@id': id })
  })
  return refs
}

// True for the schema.org `hasPart` property URI (http/https). The dataset dialog's
// Data-references section already emits `hasPart`, so a profile rule on this term
// must bind to that section instead of rendering a second generic control — the
// double-emission guard for wave B2 (never emit `hasPart` twice).
export function isHasPartUri(propertyUri: string): boolean {
  return sameSchemaOrgType(propertyUri, `${SCHEMA_ORG}hasPart`)
}
