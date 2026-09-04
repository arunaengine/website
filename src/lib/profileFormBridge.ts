// The profile builder as the assistant sees it: one reader, a few writers, and
// a single-step undo. Nothing here creates the profile; Create stays the
// user's click.
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isAbsoluteUri, normalizeTypeUri, sameSchemaOrgType, SCHEMA_ORG } from '@/lib/profiles/uri'
import { PROFILE_VALUE_KIND_LABELS } from '@/lib/profiles/labels'
import type { ProfileValueKind } from '@/lib/profiles/types'
import type {
  ProfileEntityView,
  ProfileFormBridge,
  ProfileFormSummary,
} from '@/lib/assistant/profileFormTools'
import {
  draftProperty,
  propertyName,
  trimmed,
  type DraftEntityRule,
  type ProfileBuilder,
} from '@/components/metadata/profile-builder/useProfileBuilder'

const OBLIGATIONS = ['MUST', 'SHOULD', 'MAY'] as const
const KINDS = Object.keys(PROFILE_VALUE_KIND_LABELS) as ProfileValueKind[]

interface Snapshot {
  name: string
  description: string
  version: string
  license: string
  groupId: string
  isPublic: boolean
  entities: string
}

/** The last path segment or fragment of a term URI: `creator` for schema:creator. */
function localName(uri: string): string {
  return uri.split(/[#/]/).filter(Boolean).pop() ?? ''
}

function names(entities: DraftEntityRule[]): string {
  return entities.map((entity) => trimmed(entity.label) || entityTypeLabel(normalizeTypeUri(entity.type))).join(', ') || 'nothing yet'
}

function entityView(entity: DraftEntityRule): ProfileEntityView {
  return {
    type: normalizeTypeUri(entity.type),
    label: trimmed(entity.label) || entityTypeLabel(normalizeTypeUri(entity.type)),
    locked: Boolean(entity.lock),
    properties: entity.properties.map((property) => ({
      name: trimmed(property.valueName) || trimmed(property.id),
      label: trimmed(property.label),
      obligation: property.obligation,
      kind: property.kind,
      locked: Boolean(property.lock),
    })),
  }
}

/** What the page does around a change: show the step a new rule lands on. */
export interface ProfileFormHooks {
  showRules?: () => void
}

export function createProfileFormBridge(builder: ProfileBuilder, hooks: ProfileFormHooks = {}): ProfileFormBridge {
  let saved: Snapshot | null = null

  /** A property named by its value name, its id, its label or its full term URI. */
  function findProperty(entity: DraftEntityRule, wanted: string): number {
    const needle = wanted.trim().toLowerCase()
    const local = localName(wanted).toLowerCase()
    return entity.properties.findIndex((property) =>
      [property.valueName, property.id, property.label, property.propertyUri]
        .map((value) => trimmed(value).toLowerCase())
        .some((value) => value && (value === needle || value === local)))
  }

  /** An entity named by its type, its label or its class name. */
  function findEntity(wanted: string): DraftEntityRule | null {
    const needle = wanted.trim().toLowerCase()
    if (!needle) return null
    const uri = normalizeTypeUri(wanted)
    return builder.entities.find((entity) => {
      const type = normalizeTypeUri(entity.type)
      return sameSchemaOrgType(type, uri)
        || type.toLowerCase() === needle
        || trimmed(entity.label).toLowerCase() === needle
    }) ?? null
  }

  function summary(): ProfileFormSummary {
    const group = builder.groupOptions.find((option) => option.value === builder.groupId)
    return {
      name: trimmed(builder.name),
      slug: trimmed(builder.slug),
      description: trimmed(builder.description),
      version: trimmed(builder.version),
      license: trimmed(builder.license),
      group: group?.label ?? builder.groupId,
      visibility: builder.isPublic ? 'public' : 'group',
      entities: builder.entities.map(entityView),
      problems: builder.allErrors,
    }
  }

  function snapshot() {
    saved = {
      name: builder.name,
      description: builder.description,
      version: builder.version,
      license: builder.license,
      groupId: builder.groupId,
      isPublic: builder.isPublic,
      entities: JSON.stringify(builder.entities),
    }
  }

  function undo(): boolean {
    if (!saved) return false
    builder.name = saved.name
    builder.description = saved.description
    builder.version = saved.version
    builder.license = saved.license
    builder.groupId = saved.groupId
    builder.isPublic = saved.isPublic
    builder.entities = JSON.parse(saved.entities) as DraftEntityRule[]
    if (builder.selectedEntityIndex >= builder.entities.length) builder.selectedEntityIndex = 0
    saved = null
    return true
  }

  function setBasics(input: {
    name?: string
    description?: string
    version?: string
    license?: string
    group?: string
    visibility?: string
  }): string | null {
    // Every field that can be applied is; a group or visibility that cannot be
    // is refused only when nothing else was asked for, and stays in the problems.
    const refused: string[] = []
    let applied = false
    if (input.group !== undefined) {
      const wanted = input.group.trim().toLowerCase()
      const match = builder.groupOptions.find(
        (option) => option.value === input.group || option.label.toLowerCase() === wanted,
      )
      if (match) {
        builder.groupId = match.value
        applied = true
      } else {
        const groups = builder.groupOptions.map((option) => option.label).join(', ')
        refused.push(`No group named "${input.group}"; the user is a member of ${groups || 'no group yet'}.`)
      }
    }
    if (input.visibility !== undefined) {
      if (input.visibility === 'public' || input.visibility === 'group') {
        builder.isPublic = input.visibility === 'public'
        applied = true
      } else {
        refused.push('Visibility is "public" or "group".')
      }
    }
    for (const field of ['name', 'description', 'version', 'license'] as const) {
      if (input[field] !== undefined) {
        builder[field] = input[field]
        applied = true
      }
    }
    return refused.length && !applied ? refused.join(' ') : null
  }

  function addEntity(input: { type: string; label?: string }): string | null {
    const uri = normalizeTypeUri(input.type)
    if (!uri) return 'An entity rule needs a type, such as Person or https://schema.org/Person.'
    builder.addEntityRuleForType(uri, input.label)
    hooks.showRules?.()
    return null
  }

  function addProperty(input: {
    entity: string
    name: string
    label?: string
    obligation?: string
    kind?: string
    description?: string
    target_type?: string
  }): string | null {
    const entity = findEntity(input.entity)
    if (!entity) {
      return `The profile has no rule for "${input.entity}"; it rules on ${names(builder.entities)}. Add one first.`
    }
    // A full term URI names the property and keeps the term; a short name mints one.
    const term = isAbsoluteUri(input.name.trim()) ? input.name.trim() : ''
    const valueName = propertyName(term ? localName(term) : input.name)
    if (!valueName) return 'A property rule needs a name, such as "sampleId".'
    if (findProperty(entity, valueName) >= 0) {
      return `"${valueName}" is already a rule of ${trimmed(entity.label) || input.entity}.`
    }
    const obligation = (input.obligation ?? 'MAY').toUpperCase()
    if (!OBLIGATIONS.includes(obligation as (typeof OBLIGATIONS)[number])) {
      return 'Obligation is MUST, SHOULD or MAY.'
    }
    const kind = (input.kind ?? 'text') as ProfileValueKind
    if (!KINDS.includes(kind)) return `Value kind must be one of: ${KINDS.join(', ')}.`
    const targets = kind === 'entity' ? [normalizeTypeUri(input.target_type ?? '')].filter(Boolean) : []
    if (kind === 'entity' && !targets.length) {
      return 'An entity reference needs target_type, the type it points at.'
    }
    entity.properties.push(draftProperty({
      id: valueName,
      valueName,
      label: input.label ?? input.name,
      description: input.description ?? '',
      propertyUri: term || (kind === 'entity' ? '' : `${SCHEMA_ORG}${valueName}`),
      kind,
      entityTypes: targets,
      obligation: obligation as (typeof OBLIGATIONS)[number],
    }))
    builder.selectedEntityIndex = builder.entities.indexOf(entity)
    hooks.showRules?.()
    return null
  }

  function removeProperty(input: { entity: string; name: string }): string | null {
    const entity = findEntity(input.entity)
    if (!entity) return `The profile has no rule for "${input.entity}"; it rules on ${names(builder.entities)}.`
    const index = findProperty(entity, input.name)
    if (index < 0) {
      const held = entity.properties.map((property) => trimmed(property.valueName)).join(', ') || 'nothing yet'
      return `"${input.name}" is not a rule of ${trimmed(entity.label) || input.entity}, which has: ${held}.`
    }
    if (entity.properties[index].lock) return `"${input.name}" comes from RO-Crate itself and stays.`
    builder.removeProperty(entity, index)
    return null
  }

  function removeEntity(type: string): string | null {
    const entity = findEntity(type)
    if (!entity) return `The profile has no rule for "${type}"; it rules on ${names(builder.entities)}.`
    if (entity.lock) return `The rule for ${type} comes from RO-Crate itself and stays.`
    builder.removeEntity(builder.entities.indexOf(entity))
    return null
  }

  return { summary, snapshot, undo, setBasics, addEntity, addProperty, removeProperty, removeEntity }
}
