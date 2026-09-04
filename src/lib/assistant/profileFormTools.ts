// Tools that act on the open profile builder. They are offered only while the
// profile page is open, they never create the profile, and every write asks
// through the approval gate. One Undo restores the form as it was before the
// last applied change.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import { denied, type ApprovalGate } from './types'

/** One rule the profile states about a property of an entity. */
export interface ProfilePropertyView {
  name: string
  label: string
  obligation: string
  kind: string
  /** True for a rule the RO-Crate baseline owns, which cannot be removed. */
  locked: boolean
}

export interface ProfileEntityView {
  type: string
  label: string
  locked: boolean
  properties: ProfilePropertyView[]
}

/** What the profile page reads back to the assistant. */
export interface ProfileFormSummary {
  name: string
  slug: string
  description: string
  version: string
  license: string
  group: string
  visibility: 'public' | 'group'
  entities: ProfileEntityView[]
  problems: string[]
}

/** The small API the profile page lends the assistant while it is open. */
export interface ProfileFormBridge {
  summary: () => ProfileFormSummary
  /** Records the state the next Undo restores. */
  snapshot: () => void
  undo: () => boolean
  setBasics: (input: {
    name?: string
    description?: string
    version?: string
    license?: string
    group?: string
    visibility?: string
  }) => string | null
  addEntity: (input: { type: string; label?: string }) => string | null
  addProperty: (input: {
    entity: string
    name: string
    label?: string
    obligation?: string
    kind?: string
    description?: string
    target_type?: string
  }) => string | null
  removeProperty: (input: { entity: string; name: string }) => string | null
  removeEntity: (type: string) => string | null
}

function schema<INPUT>(properties: Record<string, unknown>, required: string[] = []) {
  return jsonSchema<INPUT>({ type: 'object', properties, required } as JSONSchema7)
}

const STRING = { type: 'string' } as const

interface BasicsInput {
  name?: string
  description?: string
  version?: string
  license?: string
  group?: string
  visibility?: string
}

interface EntityInput {
  type: string
  label?: string
}

interface PropertyInput {
  entity: string
  name: string
  label?: string
  obligation?: string
  kind?: string
  description?: string
  target_type?: string
}

interface RemovePropertyInput {
  entity: string
  name: string
}

async function guarded(
  gate: ApprovalGate,
  name: string,
  input: unknown,
  toolCallId: string,
  run: () => string | null,
  bridge: ProfileFormBridge,
) {
  if (gate.enabled()) {
    const approved = await gate.ask({ id: toolCallId, name, input }, false)
    if (!approved) return denied()
  }
  bridge.snapshot()
  const error = run()
  if (error) return { error }
  const summary = bridge.summary()
  return { applied: true, problems: summary.problems }
}

export function profileFormTools(bridge: ProfileFormBridge, gate: ApprovalGate): ToolSet {
  return {
    read_profile_form: tool({
      description:
        'Reads the profile the user has open: its name, licence, group and every entity rule with the '
        + 'properties it demands, plus what still keeps it from being created. Read it before changing '
        + 'anything, and again after a change to see what it did.',
      inputSchema: schema<Record<string, never>>({}),
      execute: () => bridge.summary(),
    }),

    set_profile_basics: tool({
      description:
        'Sets the profile\'s name, description, version, licence, owning group or visibility. Pass only the '
        + 'fields to change. Visibility is "public" (published for the whole realm) or "group".',
      inputSchema: schema<BasicsInput>({
        name: STRING,
        description: STRING,
        version: STRING,
        license: STRING,
        group: STRING,
        visibility: { type: 'string', enum: ['public', 'group'] },
      }),
      execute: (input, { toolCallId }) =>
        guarded(gate, 'set_profile_basics', input, toolCallId, () => bridge.setBasics(input), bridge),
    }),

    add_profile_entity: tool({
      description:
        'Adds a rule for an entity the profile describes, such as a Person, an Organization or a File. Pass '
        + 'the schema.org type name or its full URI. A type the profile already rules on is selected instead '
        + 'of being added twice.',
      inputSchema: schema<EntityInput>({ type: STRING, label: STRING }, ['type']),
      execute: (input, { toolCallId }) =>
        guarded(gate, 'add_profile_entity', input, toolCallId, () => bridge.addEntity(input), bridge),
    }),

    add_profile_property: tool({
      description:
        'Adds one property rule to an entity of the profile: which field a dataset must carry, how strongly '
        + '(MUST, SHOULD or MAY) and what kind of value it holds (text, longtext, date, url, email, integer, '
        + 'number, boolean, keyword-list, enum or entity). For kind "entity" pass target_type, the type the '
        + 'reference points at.',
      inputSchema: schema<PropertyInput>({
        entity: STRING,
        name: STRING,
        label: STRING,
        obligation: { type: 'string', enum: ['MUST', 'SHOULD', 'MAY'] },
        kind: STRING,
        description: STRING,
        target_type: STRING,
      }, ['entity', 'name']),
      execute: (input, { toolCallId }) =>
        guarded(gate, 'add_profile_property', input, toolCallId, () => bridge.addProperty(input), bridge),
    }),

    remove_profile_property: tool({
      description:
        'Removes one property rule from an entity of the profile. A rule the RO-Crate baseline owns stays.',
      inputSchema: schema<RemovePropertyInput>({ entity: STRING, name: STRING }, ['entity', 'name']),
      execute: (input, { toolCallId }) =>
        guarded(gate, 'remove_profile_property', input, toolCallId, () => bridge.removeProperty(input), bridge),
    }),

    remove_profile_entity: tool({
      description: 'Removes an entity rule from the profile. A rule the RO-Crate baseline owns stays.',
      inputSchema: schema<EntityInput>({ type: STRING }, ['type']),
      execute: (input, { toolCallId }) =>
        guarded(gate, 'remove_profile_entity', input, toolCallId, () => bridge.removeEntity(input.type), bridge),
    }),

    undo_profile_change: tool({
      description:
        'Puts the profile form back as it was before the last change these tools applied. There is one step.',
      inputSchema: schema<Record<string, never>>({}),
      execute: () => (bridge.undo()
        ? { undone: true, form: bridge.summary() }
        : { undone: false, note: 'There is nothing to undo.' }),
    }),
  }
}
