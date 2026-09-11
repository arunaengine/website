import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editorTools, STALE_READ, type EditorBridge } from './editorTools'
import { DENIAL_MESSAGE, type ApprovalGate } from './types'
import { addEntity, addValue, newDraft, rootId, type CrateDraft } from '@/lib/crate/editor'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import { runTool } from '@/test/aiTool'

function enumRule(valueName: string, options: string[], label: string): ProfilePropertyRule {
  return {
    id: `rule-${valueName}`,
    label,
    description: `${label} of this entity.`,
    kind: 'enum',
    propertyUri: `https://schema.org/${valueName}`,
    valueName,
    obligation: 'MUST',
    enumOptions: options,
  }
}

const ACCESS_RULE = enumRule('conditionsOfAccess', ['open', 'restricted'], 'Conditions of access')
const TITLE_RULE = enumRule('honorificPrefix', ['Dr', 'Prof'], 'Honorific prefix')

function seedDraft(): CrateDraft {
  const base = newDraft()
  const withPerson = addEntity(base, { type: 'Person', id: '#alice', name: 'Alice' })
  return addValue(withPerson.draft, rootId(base), 'author', { kind: 'reference', value: '#alice' })
}

function harness(approve = true) {
  let draft = seedDraft()
  const applyProfile = vi.fn()
  const validate = vi.fn(async () => ({ accepted: true, findings: [] }))
  const ask = vi.fn(async () => approve)
  const bridge: EditorBridge = {
    draft: () => draft,
    update: (next) => {
      draft = next
    },
    summary: () => ({
      profileId: 'p-1',
      rootName: '',
      entityCount: draft.entities.length,
      partCount: 1,
      types: ['Dataset', 'Person'],
    }),
    profiles: () => [{ id: 'p-1', name: 'Workshop study profile' }],
    rules: (entityId, types) => {
      const known = draft.entities.find((entity) => entity.id === entityId)?.types
      const list = types ?? known ?? []
      if (list.includes('Person')) return [TITLE_RULE]
      return entityId === rootId(draft) ? [ACCESS_RULE] : []
    },
    applyProfile,
    validate,
  }
  const gate: ApprovalGate = { enabled: () => false, ask }
  return { tools: editorTools(bridge, gate), current: () => draft, applyProfile, validate, ask }
}

let scene: ReturnType<typeof harness>

beforeEach(() => {
  scene = harness()
})

describe('read_entity', () => {
  it('answers the entity as JSON-LD', async () => {
    const output = await runTool(scene.tools.read_entity, { id: '#alice' })
    expect(output).toMatchObject({ '@id': '#alice', '@type': ['Person'], name: 'Alice' })
  })

  it('lists the rules and the fixed options of the rows beside the entity', async () => {
    const output = await runTool(scene.tools.read_entity, { id: rootId(scene.current()) }) as Record<string, unknown>

    expect(output.fields).toContainEqual({
      property: 'conditionsOfAccess',
      obligation: 'MUST',
      kind: 'enum',
      options: ['open', 'restricted'],
      description: 'Conditions of access of this entity.',
    })
    // The license row offers presets even where no profile rule names it.
    expect(output.fields).toContainEqual({
      property: 'license',
      options: expect.arrayContaining([
        { value: 'https://creativecommons.org/licenses/by/4.0/', label: 'CC BY 4.0' },
      ]),
    })
  })

  it('reports an unknown identifier instead of throwing', async () => {
    expect(await runTool(scene.tools.read_entity, { id: '#nobody' }))
      .toEqual({ error: 'No entity #nobody in this draft.' })
  })
})

describe('edit_entity read-before-edit guard', () => {
  it('refuses an entity this chat has not read', async () => {
    const output = await runTool(scene.tools.edit_entity, { id: '#alice', set: { name: 'Bob' } })

    expect(output).toEqual({ error: STALE_READ })
    expect(scene.current().entities.find((entity) => entity.id === '#alice')?.properties.name?.[0].value)
      .toBe('Alice')
  })

  it('edits after a read and keeps the entity editable afterwards', async () => {
    await runTool(scene.tools.read_entity, { id: '#alice' })

    await runTool(scene.tools.edit_entity, { id: '#alice', set: { name: 'Alice B' } })
    const second = await runTool(scene.tools.edit_entity, { id: '#alice', push: { affiliation: 'Lab' } })

    expect(second).toMatchObject({ name: 'Alice B', affiliation: 'Lab' })
  })

  it('refuses again once the entity changed outside the chat', async () => {
    // A person typing in the editor invalidates what the model last read.
    await runTool(scene.tools.read_entity, { id: '#alice' })
    const draft = scene.current()
    draft.entities = draft.entities.map((entity) => (entity.id === '#alice'
      ? { ...entity, properties: { ...entity.properties, name: [{ kind: 'text' as const, value: 'Typed' }] } }
      : entity))

    expect(await runTool(scene.tools.edit_entity, { id: '#alice', set: { name: 'Model' } }))
      .toEqual({ error: STALE_READ })
  })

  it('drops a property the edit deletes', async () => {
    await runTool(scene.tools.read_entity, { id: '#alice' })
    const output = await runTool(scene.tools.edit_entity, { id: '#alice', delete: ['name'] })

    expect(output).not.toHaveProperty('name')
  })
})


describe('fixed options', () => {
  it('refuses a value an enum rule does not offer and writes nothing', async () => {
    const root = rootId(scene.current())
    await runTool(scene.tools.read_entity, { id: root })

    const output = await runTool(scene.tools.edit_entity, {
      id: root,
      set: { conditionsOfAccess: 'public', name: 'Survey' },
    })

    expect(output).toEqual({
      error: 'conditionsOfAccess takes one of these options: open, restricted. Nothing was written.',
    })
    const entity = scene.current().entities.find((candidate) => candidate.id === root)
    expect(entity?.properties.conditionsOfAccess).toBeUndefined()
    expect(entity?.properties.name?.[0].value).toBe('')
  })

  it('writes an option the way the rule spells it', async () => {
    const root = rootId(scene.current())
    await runTool(scene.tools.read_entity, { id: root })

    await runTool(scene.tools.edit_entity, { id: root, set: { conditionsOfAccess: ' OPEN ' } })

    expect(scene.current().entities.find((candidate) => candidate.id === root)
      ?.properties.conditionsOfAccess?.[0].value).toBe('open')
  })

  it('maps a preset label onto its value and keeps a custom license', async () => {
    const root = rootId(scene.current())
    await runTool(scene.tools.read_entity, { id: root })

    await runTool(scene.tools.edit_entity, { id: root, set: { license: 'cc by 4.0' } })
    expect(scene.current().entities.find((candidate) => candidate.id === root)?.properties.license?.[0].value)
      .toBe('https://creativecommons.org/licenses/by/4.0/')

    await runTool(scene.tools.edit_entity, { id: root, set: { license: 'https://example.test/terms' } })
    expect(scene.current().entities.find((candidate) => candidate.id === root)?.properties.license?.[0].value)
      .toBe('https://example.test/terms')
  })

  it('refuses an unknown option on a new entity instead of creating it', async () => {
    const output = await runTool(scene.tools.create_entity, {
      types: ['Person'],
      id: '#bob',
      properties: { name: 'Bob', honorificPrefix: 'Mr' },
    })

    expect(output).toEqual({
      error: 'honorificPrefix takes one of these options: Dr, Prof. Nothing was written.',
    })
    expect(scene.current().entities.some((entity) => entity.id === '#bob')).toBe(false)
  })

  it('creates the entity with the option as written and answers its fields', async () => {
    const output = await runTool(scene.tools.create_entity, {
      types: ['Person'],
      id: '#bob',
      properties: { name: 'Bob', honorificPrefix: 'prof' },
    }) as Record<string, unknown>

    expect(output).toMatchObject({ '@id': '#bob', honorificPrefix: 'Prof' })
    expect(output.fields).toContainEqual(expect.objectContaining({
      property: 'honorificPrefix',
      options: ['Dr', 'Prof'],
    }))
  })
})

describe('delete_entity', () => {
  it('asks even while the approval toggle is off, and removes references', async () => {
    const output = await runTool(scene.tools.delete_entity, { id: '#alice' }, 'call-9')

    expect(scene.ask).toHaveBeenCalledWith({ id: 'call-9', name: 'delete_entity', input: { id: '#alice' } }, true)
    expect(output).toMatchObject({ deleted: '#alice' })
    expect(scene.current().entities.some((entity) => entity.id === '#alice')).toBe(false)
  })

  it('keeps the entity and answers a denial when the user aborts', async () => {
    const aborted = harness(false)

    const output = await runTool(aborted.tools.delete_entity, { id: '#alice' })

    expect(output).toEqual({ error: DENIAL_MESSAGE })
    expect(aborted.current().entities.some((entity) => entity.id === '#alice')).toBe(true)
  })
})

describe('draft tools', () => {
  it('renames an entity and rewrites the references to it', async () => {
    const output = await runTool(scene.tools.rename_entity, { id: '#alice', new_id: '#a-smith' })

    expect(output).toEqual({ id: '#a-smith' })
    const root = scene.current().entities[0]
    expect(root.properties.author?.[0].value).toBe('#a-smith')
  })

  it('refuses a rename onto a taken identifier', async () => {
    await runTool(scene.tools.create_entity, { types: ['Organization'], id: '#org' })

    expect(await runTool(scene.tools.rename_entity, { id: '#alice', new_id: '#org' }))
      .toEqual({ error: '#org is already taken.' })
  })

  it('creates an entity with the properties it was given', async () => {
    const output = await runTool(scene.tools.create_entity, {
      types: ['Organization'],
      id: '#lab',
      properties: { name: 'Lab', url: 'https://lab.test' },
    })

    expect(output).toMatchObject({ '@id': '#lab', name: 'Lab', url: 'https://lab.test' })
    expect(scene.current().entities.some((entity) => entity.id === '#lab')).toBe(true)
  })

  it('reuses an entity of the same type and name instead of adding a twin', async () => {
    const output = await runTool(scene.tools.create_entity, {
      types: ['Person'],
      properties: { name: '  alice ', affiliation: 'Lab' },
    }) as Record<string, unknown>

    expect(output['@id']).toBe('#alice')
    expect(output.note).toContain('#alice')
    expect(output).not.toHaveProperty('affiliation')
    expect(scene.current().entities).toHaveLength(2)
  })

  it('creates a namesake of another type, and edits the reused entity after the reuse', async () => {
    const created = await runTool(scene.tools.create_entity, {
      types: ['Organization'],
      properties: { name: 'Alice' },
    }) as Record<string, unknown>
    expect(created['@id']).not.toBe('#alice')

    await runTool(scene.tools.create_entity, { types: ['Person'], properties: { name: 'Alice' } })
    const edited = await runTool(scene.tools.edit_entity, { id: '#alice', set: { jobTitle: 'PI' } })

    expect(edited).toMatchObject({ '@id': '#alice', jobTitle: 'PI' })
  })

  it('keeps creating when the input names its own identifier', async () => {
    const output = await runTool(scene.tools.create_entity, {
      types: ['Person'],
      id: '#alice-2',
      properties: { name: 'Alice' },
    })

    expect(output).toMatchObject({ '@id': '#alice-2', name: 'Alice' })
    expect(scene.current().entities).toHaveLength(3)
  })

  it('summarizes the draft with the profile and the realm profiles', async () => {
    const output = await runTool(scene.tools.crate_summary, {}) as Record<string, unknown>

    expect(output.profile_id).toBe('p-1')
    expect(output.entity_count).toBe(2)
    expect(output.available_profiles).toEqual([{ id: 'p-1', name: 'Workshop study profile' }])
  })

  it('runs the node check and reports the advisory issues beside it', async () => {
    const output = await runTool(scene.tools.validate, {}) as Record<string, unknown>

    expect(scene.validate).toHaveBeenCalledOnce()
    expect(output.node).toEqual({ accepted: true, findings: [] })
    expect(Array.isArray(output.advisory)).toBe(true)
  })

  it('refuses a profile the realm does not offer and names the ones it has', async () => {
    expect(await runTool(scene.tools.apply_profile, { profile_id: 'nope' }))
      .toEqual({ error: 'No profile nope in this realm. Available: p-1 (Workshop study profile).' })
    expect(scene.applyProfile).not.toHaveBeenCalled()
  })

  it('applies a profile the realm offers', async () => {
    expect(await runTool(scene.tools.apply_profile, { profile_id: 'p-1' })).toEqual({ profile_id: 'p-1' })
    expect(scene.applyProfile).toHaveBeenCalledWith('p-1')
  })

  it('applies a profile the user named instead of its id', async () => {
    expect(await runTool(scene.tools.apply_profile, { profile_id: '  workshop study profile ' }))
      .toEqual({ profile_id: 'p-1' })
    expect(scene.applyProfile).toHaveBeenCalledWith('p-1')
  })

  it('removes the declared profile for an empty id', async () => {
    expect(await runTool(scene.tools.apply_profile, { profile_id: '' })).toEqual({ profile_id: '' })
    expect(scene.applyProfile).toHaveBeenCalledWith('')
  })
})
