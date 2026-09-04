// The profile builder as the assistant sees it: one reader, a few writers, and
// a single-step undo. Nothing here creates the profile; Create stays the
// user's click.
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { normalizeTypeUri, sameSchemaOrgType, SCHEMA_ORG } from '@/lib/profiles/uri'
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

export function createProfileFormBridge(builder: ProfileBuilder): ProfileFormBridge {
  let saved: Snapshot | null = null

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
    if (input.group !== undefined) {
      const wanted = input.group.trim().toLowerCase()
      const match = builder.groupOptions.find(
        (option) => option.value === input.group || option.label.toLowerCase() === wanted,
      )
      if (!match) return `No group named "${input.group}". The user is a member of: ${builder.groupOptions.map((option) => option.label).join(', ') || 'none'}.`
      builder.groupId = match.value
    }
    if (input.visibility !== undefined) {
      if (input.visibility !== 'public' && input.visibility !== 'group') {
        return 'Visibility is "public" or "group".'
      }
      builder.isPublic = input.visibility === 'public'
    }
    if (input.name !== undefined) builder.name = input.name
    if (input.description !== undefined) builder.description = input.description
    if (input.version !== undefined) builder.version = input.version
    if (input.license !== undefined) builder.license = input.license
    return null
  }

  function addEntity(input: { type: string; label?: string }): string | null {
    const uri = normalizeTypeUri(input.type)
    if (!uri) return 'An entity rule needs a type, such as Person or https://schema.org/Person.'
    builder.addEntityRuleForType(uri, input.label)
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
    if (!entity) return `The profile has no rule for "${input.entity}"; add one first.`
    const valueName = propertyName(input.name)
    if (!valueName) return 'A property rule needs a name, such as "sampleId".'
    if (entity.properties.some((property) => trimmed(property.valueName) === valueName)) {
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
      propertyUri: kind === 'entity' ? '' : `${SCHEMA_ORG}${valueName}`,
      kind,
      entityTypes: targets,
      obligation: obligation as (typeof OBLIGATIONS)[number],
    }))
    return null
  }

  function removeProperty(input: { entity: string; name: string }): string | null {
    const entity = findEntity(input.entity)
    if (!entity) return `The profile has no rule for "${input.entity}".`
    const wanted = propertyName(input.name)
    const index = entity.properties.findIndex((property) => trimmed(property.valueName) === wanted)
    if (index < 0) return `"${input.name}" is not a rule of ${trimmed(entity.label) || input.entity}.`
    if (entity.properties[index].lock) return `"${input.name}" comes from RO-Crate itself and stays.`
    builder.removeProperty(entity, index)
    return null
  }

  function removeEntity(type: string): string | null {
    const entity = findEntity(type)
    if (!entity) return `The profile has no rule for "${type}".`
    if (entity.lock) return `The rule for ${type} comes from RO-Crate itself and stays.`
    builder.removeEntity(builder.entities.indexOf(entity))
    return null
  }

  return { summary, snapshot, undo, setBasics, addEntity, addProperty, removeProperty, removeEntity }
}
