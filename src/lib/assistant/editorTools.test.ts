import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editorTools, STALE_READ, type EditorBridge } from './editorTools'
import { DENIAL_MESSAGE, type ApprovalGate } from './types'
import { addEntity, addValue, newDraft, rootId, type CrateDraft } from '@/lib/crate/editor'
import { runTool } from '@/test/aiTool'

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
    profileId: () => 'p-1',
    profiles: () => [{ id: 'p-1', name: 'Base' }],
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

  it('summarizes the draft with the profile and the realm profiles', async () => {
    const output = await runTool(scene.tools.crate_summary, {}) as Record<string, unknown>

    expect(output.profile_id).toBe('p-1')
    expect(output.entity_count).toBe(2)
    expect(output.available_profiles).toEqual([{ id: 'p-1', name: 'Base' }])
  })

  it('runs the node check and reports the advisory issues beside it', async () => {
    const output = await runTool(scene.tools.validate, {}) as Record<string, unknown>

    expect(scene.validate).toHaveBeenCalledOnce()
    expect(output.node).toEqual({ accepted: true, findings: [] })
    expect(Array.isArray(output.advisory)).toBe(true)
  })

  it('refuses a profile the realm does not offer', async () => {
    expect(await runTool(scene.tools.apply_profile, { profile_id: 'nope' }))
      .toEqual({ error: 'No profile nope in this realm.' })
    expect(scene.applyProfile).not.toHaveBeenCalled()
  })

  it('applies a profile the realm offers', async () => {
    expect(await runTool(scene.tools.apply_profile, { profile_id: 'p-1' })).toEqual({ profile_id: 'p-1' })
    expect(scene.applyProfile).toHaveBeenCalledWith('p-1')
  })
})
