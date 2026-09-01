// What a realm profile asks a new dataset for, expressed in draft terms: the
// root rows to pre-add, the entities to create for its required references,
// and the same expectations again as advisory checks.

import type { MetadataProfile } from '@/data/types'
import type { ProfileEntityRule, ProfilePropertyRule, ProfileValueKind } from '@/lib/profiles/types'
import {
  addEntity,
  addValue,
  defaultValue,
  findEntity,
  rootId,
  setProperty,
  typeLabel,
  type CrateDraft,
  type DraftValue,
  type DraftValueKind,
  type ProfileExpectation,
} from './editor'

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

function draftKind(kind: ProfileValueKind): DraftValueKind {
  return KINDS[kind] ?? 'text'
}

function mandatory(rules: ProfilePropertyRule[]): ProfilePropertyRule[] {
  return rules.filter((rule) => rule.obligation === 'MUST')
}

function ruleFor(profile: MetadataProfile, type: string): ProfileEntityRule | undefined {
  return profile.entityRules.find((rule) => typeLabel(rule.type) === typeLabel(type))
}

function seededRows(rule: ProfileEntityRule | undefined): Record<string, DraftValue[]> {
  const rows: Record<string, DraftValue[]> = {}
  for (const property of mandatory(rule?.propertyRules ?? [])) {
    rows[property.valueName] = [defaultValue(draftKind(property.kind))]
  }
  return rows
}

/** The profile's mandatory root properties and referenced entity types. */
export function profileExpectation(profile: MetadataProfile): ProfileExpectation {
  const rules = mandatory(profile.propertyRules)
  return {
    name: profile.name,
    properties: rules.map((rule) => rule.valueName),
    types: [...new Set(rules.filter((rule) => rule.kind === 'entity').flatMap((rule) => rule.entityTypes ?? []))],
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
 * Pre-adds one empty row per mandatory root property, and for a mandatory
 * reference an entity of the target type carrying its own mandatory rows.
 * Rows already filled in are left untouched.
 */
export function applyProfile(draft: CrateDraft, profile: MetadataProfile, iri?: string, previousIri?: string): CrateDraft {
  const root = rootId(draft)
  const declared = findEntity(draft, root)?.properties.conformsTo ?? []
  let next = iri ? setProperty(draft, root, 'conformsTo', [
    ...declared.filter((value) => value.value !== previousIri && value.value !== iri),
    { kind: 'reference', value: iri },
  ]) : draft
  for (const rule of mandatory(profile.propertyRules)) {
    if (findEntity(next, root)?.properties[rule.valueName]?.length) continue
    const target = rule.kind === 'entity' ? rule.entityTypes?.[0] : undefined
    if (rule.kind === 'entity' && !target) continue
    if (target) {
      const created = addEntity(next, { type: target, properties: seededRows(ruleFor(profile, target)) })
      next = addValue(created.draft, root, rule.valueName, { kind: 'reference', value: created.entity.id })
      continue
    }
    next = setProperty(next, root, rule.valueName, [defaultValue(draftKind(rule.kind))])
  }
  return next
}
