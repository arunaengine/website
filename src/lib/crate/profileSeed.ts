// What a realm profile asks a new dataset for, expressed in draft terms: the
// root rows to pre-add, the entities to create for its references, and the same
// expectations again as advisory checks.

import type { MetadataProfile } from '@/data/types'
import type { ProfileEntityRule, ProfilePropertyRule, ProfileValueKind } from '@/lib/profiles/types'
import { MAX_ENTITY_DEPTH } from '@/lib/profiles/entityTree'
import {
  addEntity,
  defaultValue,
  findEntity,
  isDataType,
  rootId,
  setProperty,
  typeLabel,
  type CrateDraft,
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
  profile: MetadataProfile,
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
      next = seedEntity(next, profile, created.entity.id, target, depth + 1)
      continue
    }
    next = setProperty(next, entityId, rule.valueName, [defaultValue(draftKind(rule.kind))])
  }
  return next
}

/** The rows the profile's shape for this type asks a created entity for. */
function seedEntity(
  draft: CrateDraft,
  profile: MetadataProfile,
  entityId: string,
  type: string,
  depth: number,
): CrateDraft {
  const rule = ruleFor(profile, type)
  return rule ? seedRows(draft, profile, entityId, expected(rule.propertyRules), depth) : draft
}

/** Declares the profile on the root and seeds what it asks the dataset for. */
export function applyProfile(draft: CrateDraft, profile: MetadataProfile, iri?: string, previousIri?: string): CrateDraft {
  const root = rootId(draft)
  const declared = findEntity(draft, root)?.properties.conformsTo ?? []
  const next = iri ? setProperty(draft, root, 'conformsTo', [
    ...declared.filter((value) => value.value !== previousIri && value.value !== iri),
    { kind: 'reference', value: iri },
  ]) : draft
  return seedRows(next, profile, root, expected(profile.propertyRules ?? []), 0)
}
