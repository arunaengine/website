// What a realm profile asks a new dataset for, expressed in draft terms: the
// root rows to pre-add, the entities to create for its references, and the same
// expectations again as advisory checks.

import type { MetadataProfile } from '@/data/types'
import type { ProfileEntityRule, ProfilePropertyRule, ProfileValueKind } from '@/lib/profiles/types'
import { MAX_ENTITY_DEPTH } from '@/lib/profiles/entityTree'
import { buildProfileContext } from '@/lib/profiles/propertyCatalog'
import { collectContextObjects, contextTermsOf } from '@/lib/profiles/contextTerms'
import { contextIri, DEFAULT_CRATE_VERSION } from './version'
import {
  addEntity,
  defaultValue,
  findEntity,
  isDataType,
  partIds,
  rootId,
  setProperty,
  typeLabel,
  type CrateDraft,
  type DraftValue,
  type DraftValueKind,
  type ProfileExpectation,
  type ProfileShape,
} from './editor'
import { linkReference } from './references'

const KINDS: Readonly<Record<ProfileValueKind, DraftValueKind>> = {
  text: 'text',
  longtext: 'longtext',
  integer: 'number',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  datetime: 'datetime',
  url: 'url',
  email: 'text',
  'keyword-list': 'text',
  enum: 'text',
  entity: 'reference',
  'select-url': 'url',
  'select-object': 'reference',
}

/** The row kind a profile rule's value kind is edited as. */
export function draftKind(kind: ProfileValueKind): DraftValueKind {
  return KINDS[kind] ?? 'text'
}

/** The rows a created entity of one type starts with. */
type RulesFor = (type: string) => ProfilePropertyRule[]

/** The rows a profile pre-adds: everything it asks for, MAY left to the author. */
function expected(rules: ProfilePropertyRule[]): ProfilePropertyRule[] {
  return rules.filter((rule) => rule.obligation === 'MUST' || rule.obligation === 'SHOULD')
}

function ruleFor(profile: MetadataProfile, type: string): ProfileEntityRule | undefined {
  return (profile.entityRules ?? []).find((rule) => typeLabel(rule.type) === typeLabel(type))
}

function shapeOf(label: string, rules: ProfilePropertyRule[]): ProfileShape {
  const withObligation = (obligation: ProfilePropertyRule['obligation']) =>
    rules.filter((rule) => rule.obligation === obligation)
  return {
    label,
    required: withObligation('MUST'),
    recommended: withObligation('SHOULD'),
    optional: withObligation('MAY'),
  }
}

/** The profile's rules on the dataset and on every type it describes. */
export function profileExpectation(profile: MetadataProfile): ProfileExpectation {
  const entityRules = profile.entityRules ?? []
  const root = shapeOf(entityRules[0]?.label ?? profile.name, profile.propertyRules ?? [])
  const shapes: Record<string, ProfileShape> = {}
  for (const rule of entityRules) shapes[typeLabel(rule.type)] = shapeOf(rule.label, rule.propertyRules)
  return {
    name: profile.name,
    root,
    shapes,
    types: [...new Set(root.required
      .filter((rule) => rule.kind === 'entity')
      .flatMap((rule) => rule.entityTypes ?? []))],
    contents: (profile.propertyRules ?? []).filter((rule) => rule.requiredInstances?.length),
  }
}

/**
 * Removes one profile's IRI from the root `conformsTo`, leaving every other
 * declaration (the RO-Crate specification, an external profile) in place and
 * dropping the property when nothing is left. Rows the profile seeded stay:
 * they are empty rows the author can remove, exactly as when switching profiles.
 */
export function clearProfile(draft: CrateDraft, previousIri?: string): CrateDraft {
  if (!previousIri) return draft
  const root = rootId(draft)
  const declared = findEntity(draft, root)?.properties.conformsTo ?? []
  return setProperty(draft, root, 'conformsTo', declared.filter((value) => value.value !== previousIri))
}

/**
 * Pre-adds one empty row per rule the profile asks for, and for a reference the
 * entity of the target type carrying its own rows in turn. A data entity is
 * seeded as an empty row instead: an empty file would be the orphan the node
 * refuses, and a row prompts for Create or Link like any other reference. Rows
 * that already exist are left untouched, so re-applying changes nothing.
 */
function seedRows(
  draft: CrateDraft,
  rulesFor: RulesFor,
  entityId: string,
  rules: ProfilePropertyRule[],
  depth: number,
): CrateDraft {
  let next = draft
  for (const rule of rules) {
    if (findEntity(next, entityId)?.properties[rule.valueName]?.length) continue
    const target = rule.kind === 'entity' ? rule.entityTypes?.[0] : undefined
    if (target && !isDataType(target) && depth < MAX_ENTITY_DEPTH) {
      const created = addEntity(next, { type: target })
      next = linkReference(created.draft, entityId, rule.valueName, created.entity.id)
      next = seedRows(next, rulesFor, created.entity.id, rulesFor(target), depth + 1)
      continue
    }
    next = setProperty(next, entityId, rule.valueName, [seedValue(rule)])
  }
  return next
}

/** An empty row of the rule's kind, pre-filled when the rule names a default. */
function seedValue(rule: ProfilePropertyRule): DraftValue {
  const empty = defaultValue(draftKind(rule.kind))
  const preset = rule.defaultValue?.trim()
  return preset && empty.kind !== 'reference' ? { ...empty, value: preset } : empty
}

/** The rows the profile's shape for a created type asks for. */
function profileRows(profile: MetadataProfile): RulesFor {
  return (type) => expected(ruleFor(profile, type)?.propertyRules ?? [])
}

// Every rule a shape holds, so a picked field arrives with its own fields. A
// type is expanded once per picked rule, so shapes pointing at each other stop.
function shapeRows(profile: ProfileExpectation): RulesFor {
  const seen = new Set<string>()
  return (type) => {
    const label = typeLabel(type)
    if (seen.has(label)) return []
    seen.add(label)
    const shape = profile.shapes[label]
    return shape ? [...shape.required, ...shape.recommended, ...shape.optional] : []
  }
}

/**
 * Seeds the rows the author picked from the profile: a reference gets its typed
 * entity created and linked, carrying the rows that type's shape describes,
 * optional ones included. Rows that already exist are left untouched.
 */
export function seedRules(
  draft: CrateDraft,
  profile: ProfileExpectation,
  entityId: string,
  rules: ProfilePropertyRule[],
): CrateDraft {
  let next = draft
  for (const rule of rules) next = seedRows(next, shapeRows(profile), entityId, [rule], 0)
  return next
}

// Seeds the entities `next` holds that `previous` did not: whatever the author
// just created starts with the rows the profile's shape for its type asks for.
// Files and folders are described where they were picked and stay untouched.
export function seedNewEntities(previous: CrateDraft, next: CrateDraft, profile: MetadataProfile): CrateDraft {
  const known = new Set(previous.entities.map((entity) => entity.id))
  const parts = partIds(next)
  const rows = profileRows(profile)
  let seeded = next
  for (const entity of next.entities) {
    if (known.has(entity.id) || parts.has(entity.id)) continue
    const type = entity.types.find((candidate) => ruleFor(profile, candidate))
    if (type) seeded = seedRows(seeded, rows, entity.id, rows(type), 0)
  }
  return seeded
}

/** Declares the profile on the root and seeds what it asks the dataset for. */
export function applyProfile(draft: CrateDraft, profile: MetadataProfile, iri?: string, previousIri?: string): CrateDraft {
  const root = rootId(draft)
  const declared = findEntity(draft, root)?.properties.conformsTo ?? []
  let next = iri ? setProperty(draft, root, 'conformsTo', [
    ...declared.filter((value) => value.value !== previousIri && value.value !== iri),
    { kind: 'reference', value: iri },
  ]) : draft
  const context = next.context ?? contextIri(DEFAULT_CRATE_VERSION)
  const existing: Record<string, string> = {}
  collectContextObjects(context, existing)
  const terms = contextTermsOf(buildProfileContext(profile.entityRules, profile.contextTerms))
  const additions = Object.fromEntries(Object.entries(terms).filter(([key]) => !(key in existing)))
  if (Object.keys(additions).length) {
    next = { ...next, context: [...(Array.isArray(context) ? context : [context]), additions] }
  }
  return seedRows(next, profileRows(profile), root, expected(profile.propertyRules ?? []), 0)
}
