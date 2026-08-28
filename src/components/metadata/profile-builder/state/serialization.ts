import { safeIdSegment } from '@/lib/profiles/rocrate'
import { mintTermUri } from '@/lib/profiles/propertyCatalog'
import { isHasPartUri } from '@/lib/profiles/emit'
import { normalizeEntitySources } from '@/lib/profiles/sources'
import { normalizeTypeUri, sameSchemaOrgType, SCHEMA_ORG, termNameFromUri } from '@/lib/profiles/uri'
import type {
  ProfileEntityRule,
  ProfileObligation,
  ProfilePropertyRule,
  ProfileRequiredInstance,
} from '@/lib/profiles/types'
import {
  draftEntity,
  draftProperty,
  hasPreservedUrlOptions,
  isBaselineRootTerm,
  parseNumber,
  propertyName,
  splitOptions,
  toText,
  trimmed,
  type DraftEntityRule,
  type DraftPropertyRule,
  type DraftRequiredInstance,
} from './drafts'

// L2: enforce the RO-Crate obligation floor on the re-locked root baseline rules at
// normalize time (not just in the UI): name/description are always MUST; license and
// datePublished floor at SHOULD (a stray MAY from an import becomes SHOULD). Only
// touches structurally-locked baseline rules, so authored rules pass through.
function clampBaselineObligation(property: DraftPropertyRule): ProfileObligation {
  if (property.lock !== 'structural') return property.obligation
  const uri = trimmed(property.propertyUri)
  if (sameSchemaOrgType(uri, `${SCHEMA_ORG}name`) || sameSchemaOrgType(uri, `${SCHEMA_ORG}description`)) {
    return 'MUST'
  }
  if (sameSchemaOrgType(uri, `${SCHEMA_ORG}license`) || sameSchemaOrgType(uri, `${SCHEMA_ORG}datePublished`)) {
    return property.obligation === 'MAY' ? 'SHOULD' : property.obligation
  }
  return property.obligation
}

// Reverse of normalizeProperty/normalizeEntity: hydrate editable drafts from the
// strict lib rules produced by an import (mode file or profile crate). Numeric
// constraints come back as numbers, enum options as a comma-separated string.
export function draftFromPropertyRule(rule: ProfilePropertyRule, isRootEntity = false): DraftPropertyRule {
  // L1: a select-url that imported non-string options is preserved verbatim, so those
  // options are NOT lifted into the editable urlOptions list (they would coerce to
  // "[object Object]"); normalize re-emits the original valueOptions untouched.
  const preservedUrl = rule.kind === 'select-url' && hasPreservedUrlOptions(rule.valueOptions)
  return draftProperty({
    id: rule.id,
    label: rule.label,
    description: rule.description,
    valueName: rule.valueName,
    propertyUri: rule.propertyUri,
    kind: rule.kind,
    entityTypes: rule.entityTypes ? [...rule.entityTypes] : [],
    obligation: rule.obligation,
    defaultValue: rule.defaultValue ?? '',
    example: rule.example ?? '',
    enumOptions: (rule.enumOptions ?? []).join(', '),
    pattern: rule.pattern ?? '',
    minLength: rule.minLength ?? '',
    maxLength: rule.maxLength ?? '',
    minValue: rule.minValue ?? '',
    maxValue: rule.maxValue ?? '',
    stepValue: rule.stepValue ?? '',
    multipleValues: rule.multipleValues ?? false,
    minItems: rule.minItems ?? '',
    maxItems: rule.maxItems ?? '',
    entitySources: rule.entitySources,
    requiredInstances: (rule.requiredInstances ?? []).map(draftRequiredInstance),
    // All-string select-url options round-trip as the authorable URL list; preserved
    // (non-string) select-url and select-object keep their raw options on valueOptions.
    urlOptions: rule.kind === 'select-url' && !preservedUrl ? (rule.valueOptions ?? []).map((option) => toText(option)) : [],
    valueOptions: rule.valueOptions ? [...rule.valueOptions] : undefined,
    // L2: re-apply the RO-Crate structural lock to the root dataset's baseline four
    // rules so an import/edit round-trip restores their fixed identity + obligation
    // floor instead of leaving them fully editable/removable.
    lock: isRootEntity && isBaselineRootTerm(rule.propertyUri) ? 'structural' : undefined,
  })
}

// Rehydrate a required-instance row from a strict lib instance. `id` takes
// precedence (when both are present only `id` survives the schema round-trip, see
// ProfileRequiredInstance), so an id-bearing instance matches by @id.
function draftRequiredInstance(instance: ProfileRequiredInstance): DraftRequiredInstance {
  const byId = instance.id !== undefined && instance.id !== ''
  return {
    match: byId ? 'id' : 'name',
    value: byId ? (instance.id ?? '') : (instance.name ?? ''),
    hint: instance.hint ?? '',
  }
}

export function draftFromEntityRule(rule: ProfileEntityRule, isRoot = false): DraftEntityRule {
  return {
    ...draftEntity({
      id: rule.id,
      label: rule.label,
      description: rule.description,
      type: rule.type,
      // Keep the imported class alias so it round-trips instead of being re-derived.
      className: rule.className,
      // L2: forward the root flag so the dataset root's baseline rules re-lock.
      properties: rule.propertyRules.map((property) => draftFromPropertyRule(property, isRoot)),
    }),
    imported: true,
  }
}

export function normalizeEntity(entity: DraftEntityRule, index: number, slug: string): ProfileEntityRule | undefined {
  const id = safeIdSegment(toText(entity.id) || toText(entity.label) || `entity-${index + 1}`)
  const label = trimmed(entity.label)
  const type = normalizeTypeUri(entity.type)
  if (!id || !label || !type) return undefined
  // className (D3/H4): preserve the draft's className for ALL types, including
  // schema.org, falling back to the derived name only when empty; mirrors
  // rocrate.ts normalizeEntityRules so an imported schema.org-typed alias (e.g. a
  // Person class keyed `Author`) survives a builder normalize→export cycle
  // instead of being flattened back to termNameFromUri(type).
  const className = trimmed(entity.className) || termNameFromUri(type)
  return {
    id,
    label,
    description: trimmed(entity.description),
    type,
    className,
    propertyRules: entity.properties
      .map((property, propertyIndex) => normalizeProperty(property, propertyIndex, slug))
      .filter((property): property is ProfilePropertyRule => Boolean(property)),
  }
}

function normalizeProperty(property: DraftPropertyRule, index: number, slug: string): ProfilePropertyRule | undefined {
  const id = safeIdSegment(toText(property.id) || toText(property.label) || `property-${index + 1}`)
  const label = trimmed(property.label)
  // Validate the value name exactly as typed (D2): auto-derive from the id/label
  // ONLY when the field is empty, and never strip characters from a typed name;
  // an invalid name surfaces as a blocking rulesErrors entry instead of being
  // silently rewritten ("assay type" -> "assaytype").
  const valueName = trimmed(property.valueName) || propertyName(id)
  if (!id || !label || !valueName) return undefined
  // An explicit URI (curated or external) passes through; an empty one is a
  // custom term whose URI is minted from the live slug so it tracks slug edits.
  const explicitUri = trimmed(property.propertyUri)
  const propertyUri = explicitUri || mintTermUri(slug || 'profile', valueName)
  const isEntity = property.kind === 'entity'
  const isMulti = property.multipleValues || property.kind === 'keyword-list'
  // Required contents (WS5/M2): only for MULTI-VALUED entity references; a single
  // reference has no list to constrain, and emitting them for a non-multiple rule
  // would strand rows that the editor no longer shows. Empty-value rows are dropped
  // (an empty match can never be satisfied).
  const requiredInstances = isEntity && isMulti
    ? property.requiredInstances
        .map(normalizeRequiredInstance)
        .filter((instance): instance is ProfileRequiredInstance => Boolean(instance))
    : []
  // Entity-source policy only carries for entity references that the generated
  // form actually renders as an entity control. hasPart binds to the dataset
  // dialog's data-references section, so a policy there is meaningless; drop
  // it. Required-contents lists KEEP their policy: schema.json encodes `items`
  // alongside `contains`, so both round-trip (the v2 lossy combo is gone).
  const entitySources =
    isEntity && !isHasPartUri(propertyUri) ? normalizeEntitySources(property.entitySources) : undefined
  return {
    id,
    label,
    description: trimmed(property.description),
    kind: property.kind,
    propertyUri,
    valueName,
    // L2: floor the re-locked root baseline rules' obligation (name/description →
    // MUST, license/datePublished → SHOULD); every other rule passes through.
    obligation: clampBaselineObligation(property),
    defaultValue: trimmed(property.defaultValue) || undefined,
    example: trimmed(property.example) || undefined,
    enumOptions: property.kind === 'enum' ? splitOptions(property.enumOptions) : undefined,
    pattern: trimmed(property.pattern) || undefined,
    minLength: parseNumber(property.minLength),
    maxLength: parseNumber(property.maxLength),
    minValue: parseNumber(property.minValue),
    maxValue: parseNumber(property.maxValue),
    stepValue: parseNumber(property.stepValue),
    multipleValues: isMulti,
    // List cardinality is meaningful only on multi-valued rules.
    minItems: isMulti ? parseNumber(property.minItems) : undefined,
    maxItems: isMulti ? parseNumber(property.maxItems) : undefined,
    entitySources,
    requiredInstances: requiredInstances.length ? requiredInstances : undefined,
    // Target types are meaningful only for entity references.
    entityTypes: isEntity ? property.entityTypes.filter(Boolean) : undefined,
    // Authored select-url URLs re-emit as string options; a preserved (non-string)
    // select-url and select-object keep their raw imported options verbatim (L1).
    valueOptions:
      property.kind === 'select-url'
        ? hasPreservedUrlOptions(property.valueOptions)
          ? property.valueOptions
          : property.urlOptions.map((option) => trimmed(option)).filter(Boolean)
        : property.kind === 'select-object'
          ? property.valueOptions
          : undefined,
  }
}

// One draft "required contents" row → a strict ProfileRequiredInstance, or
// undefined when it has no value to match on. `id` and `name` are exclusive per
// row (the author picks which); `hint` travels when set.
function normalizeRequiredInstance(row: DraftRequiredInstance): ProfileRequiredInstance | undefined {
  const value = trimmed(row.value)
  if (!value) return undefined
  const instance: ProfileRequiredInstance = row.match === 'id' ? { id: value } : { name: value }
  const hint = trimmed(row.hint)
  if (hint) instance.hint = hint
  return instance
}
