// Tools that act on the dataset editor's live draft. They are offered only
// while the editor is open, they never persist anything, and the user still
// presses Save. A delete always asks first, whatever the approval toggle says.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import {
  addEntity,
  draftValues,
  findEntity,
  findSimilarEntity,
  liveIssues,
  partIds,
  removeEntity,
  renameEntity,
  rootEntity,
  rootId,
  setProperty,
  setTypes,
  type CrateDraft,
  type DraftEntity,
  type DraftValue,
} from '@/lib/crate/editor'
import type { DraftContext } from './prompt'
import { fetchOrcidRecord } from '@/lib/lookup/orcid'
import { fetchRorRecord } from '@/lib/lookup/ror'
import { errorMessage } from '@/lib/utils'
import { denied, type ApprovalGate } from './types'

/** What the editor view lends the assistant; nothing reaches into the view. */
export interface EditorBridge {
  draft: () => CrateDraft
  update: (next: CrateDraft) => void
  /** What the system prompt says about the open draft. */
  summary: () => DraftContext
  profiles: () => Array<{ id: string; name: string }>
  applyProfile: (profileId: string) => void
  validate: () => Promise<unknown>
}

interface Failure {
  error: string
}

const NO_ENTITY = (id: string): Failure => ({ error: `No entity ${id} in this draft.` })

const STALE_READ =
  'Read the entity again before editing it: it was never read in this chat, or it changed since.'

function schema<INPUT>(properties: Record<string, unknown>, required: string[] = []) {
  return jsonSchema<INPUT>({ type: 'object', properties, required } as JSONSchema7)
}

const STRING = { type: 'string' } as const
const ANY_MAP = { type: 'object', additionalProperties: true } as const

/** Key-order independent, so a rewrite that reorders rows is not a change. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function jsonValue(value: DraftValue): unknown {
  if (value.kind === 'reference') return { '@id': value.value }
  if (value.kind === 'boolean') return value.value === 'true'
  if (value.kind === 'number') return Number(value.value)
  return value.value
}

function entityJson(entity: DraftEntity): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [property, list] of Object.entries(entity.properties)) {
    const encoded = list.map(jsonValue)
    properties[property] = encoded.length === 1 ? encoded[0] : encoded
  }
  return { '@id': entity.id, '@type': entity.types, ...properties, ...entity.extra }
}

function rows(raw: unknown): DraftValue[] | undefined {
  return draftValues(raw)
}

interface EditInput {
  id: string
  set?: Record<string, unknown>
  push?: Record<string, unknown>
  delete?: string[]
}

/**
 * Builds the editor tool set. The read-before-edit guard lives in the closure,
 * so a new chat session starts with an empty memory of what it has read.
 */
export function editorTools(bridge: EditorBridge, gate: ApprovalGate): ToolSet {
  const seen = new Map<string, string>()

  function remember(entity: DraftEntity) {
    seen.set(entity.id, stableJson(entityJson(entity)))
  }

  function guard(entity: DraftEntity): boolean {
    return seen.get(entity.id) === stableJson(entityJson(entity))
  }

  function applyEdit(draft: CrateDraft, input: EditInput): CrateDraft {
    let next = draft
    for (const [property, value] of Object.entries(input.set ?? {})) {
      next = setProperty(next, input.id, property, rows(value) ?? [])
    }
    for (const [property, value] of Object.entries(input.push ?? {})) {
      const existing = findEntity(next, input.id)?.properties[property] ?? []
      next = setProperty(next, input.id, property, [...existing, ...(rows(value) ?? [])])
    }
    for (const property of input.delete ?? []) next = setProperty(next, input.id, property, [])
    return next
  }

  return {
    read_entity: tool({
      description: 'Reads one entity of the open draft. Required before editing it.',
      inputSchema: schema<{ id: string }>({ id: STRING }, ['id']),
      execute: ({ id }) => {
        const entity = findEntity(bridge.draft(), id)
        if (!entity) return NO_ENTITY(id)
        remember(entity)
        return entityJson(entity)
      },
    }),

    edit_entity: tool({
      description:
        'Changes one entity of the open draft: `set` replaces properties, `push` appends values, '
        + '`delete` removes properties. Read the entity first.',
      inputSchema: schema<EditInput>({ id: STRING, set: ANY_MAP, push: ANY_MAP, delete: { type: 'array', items: STRING } }, ['id']),
      execute: (input) => {
        const draft = bridge.draft()
        const entity = findEntity(draft, input.id)
        if (!entity) return NO_ENTITY(input.id)
        if (!guard(entity)) return { error: STALE_READ }
        const next = applyEdit(draft, input)
        bridge.update(next)
        const updated = findEntity(next, input.id)
        if (updated) remember(updated)
        return updated ? entityJson(updated) : NO_ENTITY(input.id)
      },
    }),

    create_entity: tool({
      description:
        'Adds an entity to the open draft, or answers the entity that already carries that type and '
        + 'name. Link it from another entity with edit_entity.',
      inputSchema: schema<{ types: string[]; id?: string; properties?: Record<string, unknown> }>({
        types: { type: 'array', items: STRING },
        id: STRING,
        properties: ANY_MAP,
      }, ['types']),
      execute: (input) => {
        const properties: Record<string, DraftValue[]> = {}
        for (const [property, value] of Object.entries(input.properties ?? {})) {
          const list = rows(value)
          if (list) properties[property] = list
        }
        const type = input.types[0] ?? 'Thing'
        const name = properties.name?.[0]?.value ?? ''
        // A named entity without an explicit id reuses the match the Add dialog
        // would have offered, so one chat cannot mint two entities for one thing.
        if (!input.id?.trim() && name) {
          const known = findSimilarEntity(bridge.draft(), type, name)
          if (known) {
            remember(known)
            return {
              ...entityJson(known),
              note: `reused the existing entity ${known.id} with the same name`,
            }
          }
        }
        const added = addEntity(bridge.draft(), {
          type,
          ...(input.id ? { id: input.id } : {}),
          properties,
        })
        const draft = input.types.length > 1 ? setTypes(added.draft, added.entity.id, input.types) : added.draft
        const entity = findEntity(draft, added.entity.id) ?? added.entity
        bridge.update(draft)
        remember(entity)
        return entityJson(entity)
      },
    }),

    rename_entity: tool({
      description: 'Renames an entity and rewrites every reference that pointed at the old identifier.',
      inputSchema: schema<{ id: string; new_id: string }>({ id: STRING, new_id: STRING }, ['id', 'new_id']),
      execute: (input) => {
        const draft = bridge.draft()
        if (!findEntity(draft, input.id)) return NO_ENTITY(input.id)
        if (findEntity(draft, input.new_id)) return { error: `${input.new_id} is already taken.` }
        const next = renameEntity(draft, input.id, input.new_id)
        bridge.update(next)
        seen.delete(input.id)
        const renamed = findEntity(next, input.new_id)
        if (renamed) remember(renamed)
        return { id: input.new_id }
      },
    }),

    delete_entity: tool({
      description: 'Removes an entity from the draft together with every reference to it.',
      inputSchema: schema<{ id: string }>({ id: STRING }, ['id']),
      execute: async ({ id }, { toolCallId }) => {
        const draft = bridge.draft()
        if (!findEntity(draft, id)) return NO_ENTITY(id)
        // A delete always asks, whatever the approval toggle says.
        const approved = await gate.ask({ id: toolCallId, name: 'delete_entity', input: { id } }, true)
        if (!approved) return denied()
        const result = removeEntity(draft, id)
        bridge.update(result.draft)
        seen.delete(id)
        return { deleted: id, references_removed: result.removed }
      },
    }),

    crate_summary: tool({
      description: 'Summarizes the open draft: name, profile, entity counts and the types present.',
      inputSchema: schema<Record<string, never>>({}),
      execute: () => {
        const draft = bridge.draft()
        const summary = bridge.summary()
        return {
          root_id: rootId(draft),
          name: summary.rootName ?? '',
          description: rootEntity(draft)?.properties.description?.[0]?.value ?? '',
          profile_id: summary.profileId ?? '',
          entity_count: summary.entityCount,
          part_count: summary.partCount,
          types: summary.types,
          available_profiles: bridge.profiles(),
        }
      },
    }),

    list_parts: tool({
      description: 'Lists the data entities the draft points at, with their contentUrl.',
      inputSchema: schema<Record<string, never>>({}),
      execute: () => {
        const draft = bridge.draft()
        return [...partIds(draft)].map((id) => {
          const entity = findEntity(draft, id)
          return {
            id,
            types: entity?.types ?? [],
            name: entity?.properties.name?.[0]?.value ?? '',
            content_url: entity?.properties.contentUrl?.[0]?.value ?? '',
            encoding_format: entity?.properties.encodingFormat?.[0]?.value ?? '',
          }
        })
      },
    }),

    validate: tool({
      description: 'Runs the node check the Save button runs, and returns its findings.',
      inputSchema: schema<Record<string, never>>({}),
      execute: async () => {
        const advisory = liveIssues(bridge.draft()).map((issue) => ({
          severity: issue.severity,
          message: issue.message,
          entity_id: issue.entityId,
        }))
        try {
          return { node: await bridge.validate(), advisory }
        } catch (cause) {
          return { node: null, advisory, error: errorMessage(cause) }
        }
      },
    }),

    apply_profile: tool({
      description: 'Declares a realm metadata profile on the draft and seeds the rows it requires.',
      inputSchema: schema<{ profile_id: string }>({ profile_id: STRING }, ['profile_id']),
      execute: ({ profile_id: profileId }) => {
        if (!bridge.profiles().some((profile) => profile.id === profileId)) {
          return { error: `No profile ${profileId} in this realm.` }
        }
        bridge.applyProfile(profileId)
        return { profile_id: profileId }
      },
    }),

    import_person_orcid: tool({
      description: 'Adds a Person entity from an ORCID identifier.',
      inputSchema: schema<{ orcid: string }>({ orcid: STRING }, ['orcid']),
      execute: async ({ orcid }) => {
        try {
          const record = await fetchOrcidRecord(orcid)
          const created = addEntity(bridge.draft(), {
            type: 'Person',
            id: record.id,
            properties: {
              name: rows(record.name) ?? [],
              ...(record.givenName ? { givenName: rows(record.givenName) ?? [] } : {}),
              ...(record.familyName ? { familyName: rows(record.familyName) ?? [] } : {}),
            },
          })
          bridge.update(created.draft)
          remember(created.entity)
          return entityJson(created.entity)
        } catch (cause) {
          return { error: errorMessage(cause) }
        }
      },
    }),

    import_organization_ror: tool({
      description: 'Adds an Organization entity from a ROR identifier.',
      inputSchema: schema<{ ror: string }>({ ror: STRING }, ['ror']),
      execute: async ({ ror }) => {
        try {
          const record = await fetchRorRecord(ror)
          const created = addEntity(bridge.draft(), {
            type: 'Organization',
            id: record.id,
            properties: {
              name: rows(record.name) ?? [],
              ...(record.url ? { url: rows(record.url) ?? [] } : {}),
            },
          })
          bridge.update(created.draft)
          remember(created.entity)
          return entityJson(created.entity)
        } catch (cause) {
          return { error: errorMessage(cause) }
        }
      },
    }),
  }
}

export { STALE_READ }
