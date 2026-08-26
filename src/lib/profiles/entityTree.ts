import { controlsFromRules, defaultControlValues, normalizeProfileValues } from './controls'
import { schemaFromPropertyRules } from './schema'
import { validateProfileData } from './validate'
import {
  effectiveEntryValues,
  entryRefInvalid,
  entrySourcePolicy,
  type EntityEntry,
} from './entityEntries'
import { entityTypeLabel } from './entityTypes'
import { isSchemaOrgUri } from './propertyCatalog'
import { isInvalidReferenceUri, isRecord, REFERENCE_URI_MESSAGE } from './uri'
import type {
  JsonSchema,
  ProfileControl,
  ProfileEntityRule,
  ProfilePropertyRule,
  ProfileViolation,
} from './types'

// Recursive reuse-or-create entity model. An entity-kind sub-control whose
// target type has an entity rule in the profile nests a full sub-form (its
// instance value is an `EntityEntry[]` of its own) up to MAX_ENTITY_DEPTH
// levels of described-new forms below the Dataset root. At the cap, and for
// target types without a rule, the value stays the flat URI-reference shape
// ('' single / string[] multiple), each emitted as a `{"@id"}` reference.
export const MAX_ENTITY_DEPTH = 5

// Whether an entity-kind control at a form of `depth` opens a nested sub-form
// (depth + 1) instead of the flat URI-reference input.
export function nestsSubForm(control: ProfileControl, depth: number): boolean {
  return depth < MAX_ENTITY_DEPTH && Boolean(control.entityRule)
}

// The sub-form seeded for an entity reference whose target type has no entity
// rule in the profile: a single Name (Text) field so instances aren't fieldless.
export const MINIMAL_ENTITY_RULE: ProfilePropertyRule = {
  id: 'name',
  label: 'Name',
  description: '',
  kind: 'text',
  propertyUri: 'http://schema.org/name',
  valueName: 'name',
  obligation: 'MAY',
}

// Single derivation of a control's sub-form controls, shared by every depth.
export function subControlsFor(control: ProfileControl, entityRules: ProfileEntityRule[]): ProfileControl[] {
  return control.entityRule
    ? controlsFromRules(control.entityRule.propertyRules, entityRules)
    : controlsFromRules([MINIMAL_ENTITY_RULE], entityRules)
}

// Per-entity JSON Schema used for per-instance scalar validation.
export function entitySchemaFor(control: ProfileControl): JsonSchema {
  return control.entityRule
    ? schemaFromPropertyRules(
        { name: control.entityRule.label, description: control.entityRule.description },
        control.entityRule.propertyRules,
      )
    : schemaFromPropertyRules({ name: entityTypeLabelFor(control), description: '' }, [MINIMAL_ENTITY_RULE])
}

// Display label of an entity reference: the resolved entity rule's type, else the
// first target type URI, never the literal 'entity' unless nothing is set.
export function entityTypeLabelFor(control: ProfileControl): string {
  const type = control.entityRule?.type ?? control.entityTypes?.[0] ?? ''
  return entityTypeLabel(type) || 'entity'
}

// @type of an EMITTED entity instance: the resolved entity rule's canonical
// className, the JSON-LD compact alias mapped in the crate @context (D3), so an
// imported alias (e.g. `Specimen` over an OBO PURL) survives instead of being
// re-derived from the type URI. For a ruleless target: a schema.org type emits its
// bare label (resolvable via the base context); a custom type emits its context
// token when one is mapped, else the FULL type URI (M1) so @type is never an
// undefined JSON-LD term. No literal 'entity' fallback.
export function entityTypeName(control: ProfileControl, contextTerms: Record<string, string>): string {
  if (control.entityRule?.className) return control.entityRule.className
  const target = control.entityTypes?.[0] ?? ''
  if (!target) return 'Thing'
  if (isSchemaOrgUri(target)) return entityTypeLabel(target)
  const token = Object.keys(contextTerms).find((key) => contextTerms[key] === target)
  return token || target
}

// Monotonic per-entry identity so entity-entry cards key on a stable uid rather
// than their array index (mirrors the builder draft uid discipline).
let entryUid = 0
export function nextEntryUid(): number {
  return ++entryUid
}

// A nested instance value that holds entry lists (vs the flat URI shapes).
export function isEntityEntryList(value: unknown): value is EntityEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) && typeof entry.__uid === 'number' && (entry.source === 'new' || entry.source === 'existing'),
    )
  )
}

export function entriesOf(value: unknown): EntityEntry[] {
  return isEntityEntryList(value) ? value : []
}

export function newRefEntry(): EntityEntry {
  return { __uid: nextEntryUid(), source: 'existing', ref: '' }
}

// A described-new entry whose sub-form sits at `depth`.
export function newEntityEntry(control: ProfileControl, entityRules: ProfileEntityRule[], depth: number): EntityEntry {
  return {
    __uid: nextEntryUid(),
    source: 'new',
    instance: newEntityInstance(subControlsFor(control, entityRules), entityRules, depth),
  }
}

// A fresh instance record for a depth-`depth` sub-form: scalar controls seeded
// from defaults, nesting entity fields seeded via seedEntries (depth + 1), flat
// reference fields as empty URI values.
export function newEntityInstance(
  subControls: ProfileControl[],
  entityRules: ProfileEntityRule[],
  depth: number,
): Record<string, unknown> {
  const values = defaultControlValues(subControls)
  for (const control of subControls) {
    if (control.control !== 'entity') continue
    values[control.property] = nestsSubForm(control, depth)
      ? seedEntries(control, entityRules, depth + 1)
      : control.multiple
        ? []
        : ''
  }
  return values
}

// Seeding policy, identical at every depth: a required (MUST) rule that allows
// describing a new entity starts with one described-new entry so its sub-form
// shows up immediately; other new-allowing rules start empty (an untouched form
// never emits an empty entity). Reuse-only single-valued rules seed one empty
// reference entry; reuse-only lists start empty. The depth cap makes seeding of
// cyclically-required classes terminate.
export function seedEntries(control: ProfileControl, entityRules: ProfileEntityRule[], depth: number): EntityEntry[] {
  if (depth > MAX_ENTITY_DEPTH) return []
  const policy = entrySourcePolicy(control.entitySources)
  if (policy.allowNew) return control.required ? [newEntityEntry(control, entityRules, depth)] : []
  return control.multiple ? [] : [newRefEntry()]
}

export interface EntityTreeContext {
  entityRules: ProfileEntityRule[]
  crateIds: ReadonlySet<string>
}

// Violations of one entry: its own findings plus the trees of its nested entry
// lists, keyed by sub-control property. Display (DatasetEntityInstances) and
// submit gating (countEntryErrors) both read this one structure.
export interface EntryViolationNode {
  own: ProfileViolation[]
  nested: Record<string, EntryViolationNode[]>
}

// Per-entry violations for one control's entry list at `depth`. Described-new
// entries get the target shape's scalar validation, flat-reference format
// checks, and recursive nested trees; reuse entries get the reference-format
// check ONLY (reuse-by-URI is never re-validated against the shape, plan 5.4).
export function validateEntries(
  entries: EntityEntry[],
  control: ProfileControl,
  ctx: EntityTreeContext,
  depth: number,
): EntryViolationNode[] {
  const policy = entrySourcePolicy(control.entitySources)
  const subControls = subControlsFor(control, ctx.entityRules)
  const schema = entitySchemaFor(control)
  return entries.map((entry) => {
    if (entry.source !== 'new') {
      return {
        own: entryRefInvalid(entry, policy, ctx.crateIds) ? [refFormatViolation(control.property)] : [],
        nested: {},
      }
    }
    const instance = entry.instance ?? {}
    const nested: Record<string, EntryViolationNode[]> = {}
    for (const field of subControls) {
      if (field.control !== 'entity' || !nestsSubForm(field, depth)) continue
      nested[field.property] = validateEntries(entriesOf(instance[field.property]), field, ctx, depth + 1)
    }
    return {
      own: [
        ...validateProfileData(schema, instanceValues(instance, subControls, ctx, depth)),
        ...flatRefViolations(instance, subControls, depth),
      ],
      nested,
    }
  })
}

// Values for per-instance validation: scalar controls normalized (keeping empty
// keys so presence checks fire); nesting entity fields contribute their
// effective entry values so presence and list cardinality act on the COMBINED
// entry count; flat reference fields keep their raw URI value (blank rows
// dropped, M5, so an empty repeatable row cannot satisfy a required reference).
export function instanceValues(
  instance: Record<string, unknown>,
  subControls: ProfileControl[],
  ctx: EntityTreeContext,
  depth: number,
): Record<string, unknown> {
  const values = normalizeProfileValues(instance, subControls)
  for (const control of subControls) {
    if (control.control === 'entity') {
      if (nestsSubForm(control, depth)) {
        const effective = effectiveEntryValues(
          entriesOf(instance[control.property]),
          entrySourcePolicy(control.entitySources),
          ctx.crateIds,
        )
        values[control.property] = control.multiple ? effective : effective[0] ?? ''
      } else {
        const raw = instance[control.property]
        values[control.property] = control.multiple
          ? Array.isArray(raw)
            ? raw.map((entry) => String(entry).trim()).filter(Boolean)
            : []
          : typeof raw === 'string'
            ? raw
            : ''
      }
    } else if (control.control === 'select-object') {
      // Skipped by normalizeProfileValues (a reference, not a scalar); surface
      // the raw value so its required/recommended presence check fires.
      values[control.property] = instance[control.property]
    }
  }
  return values
}

// Flat (cap-level or ruleless) entity references are plain URI inputs; a
// non-empty value that is not an absolute URI is a blocking field error (it
// would emit a broken `{"@id"}` reference).
function flatRefViolations(
  instance: Record<string, unknown>,
  subControls: ProfileControl[],
  depth: number,
): ProfileViolation[] {
  const violations: ProfileViolation[] = []
  for (const control of subControls) {
    if (control.control !== 'entity' || nestsSubForm(control, depth)) continue
    const raw = instance[control.property]
    const entries = control.multiple ? (Array.isArray(raw) ? raw : []) : [raw]
    entries.forEach((entry, index) => {
      if (typeof entry === 'string' && isInvalidReferenceUri(entry)) {
        violations.push({
          ...refFormatViolation(control.property),
          pointer: control.multiple ? `/${control.property}/${index}` : `/${control.property}`,
        })
      }
    })
  }
  return violations
}

function refFormatViolation(property: string): ProfileViolation {
  return {
    ruleId: 'format.uri',
    pointer: `/${property}`,
    fieldId: property,
    message: REFERENCE_URI_MESSAGE,
    severity: 'error',
  }
}

// Blocking error count across a violation forest: the submit gate.
export function countEntryErrors(nodes: EntryViolationNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += node.own.filter((violation) => violation.severity === 'error').length
    for (const children of Object.values(node.nested)) count += countEntryErrors(children)
  }
  return count
}

// Immutable single-entry update; `patch` returning undefined keeps the list
// (e.g. an op that applies to the other entry source).
export function updatedEntries(
  list: EntityEntry[],
  index: number,
  patch: (entry: EntityEntry) => EntityEntry | undefined,
): EntityEntry[] {
  const entry = list[index]
  if (!entry) return list
  const next = patch(entry)
  if (!next) return list
  const copy = [...list]
  copy[index] = next
  return copy
}

export function removedEntry(list: EntityEntry[], index: number): EntityEntry[] {
  const copy = [...list]
  copy.splice(index, 1)
  return copy
}
