import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({
    groups: ref([{ id: 'g-1', name: 'Genomics lab' }]),
    currentUser: ref({ id: 'u-1', name: 'Ada' }),
  }),
}))

const { useProfileBuilder } = await import('@/components/metadata/profile-builder/useProfileBuilder')
const { createProfileFormBridge } = await import('./profileFormBridge')

let builder: ReturnType<typeof useProfileBuilder>
let bridge: ReturnType<typeof createProfileFormBridge>

beforeEach(() => {
  builder = useProfileBuilder()
  builder.reset()
  bridge = createProfileFormBridge(builder)
})

describe('createProfileFormBridge', () => {
  it('reads the basics, the group and the baseline rules', async () => {
    bridge.setBasics({ name: 'Sequencing runs', group: 'genomics lab', visibility: 'group' })
    // The slug follows the name through a watcher, so it lands a tick later.
    await nextTick()

    const form = bridge.summary()
    expect(form.name).toBe('Sequencing runs')
    expect(form.slug).toBe('sequencing-runs')
    expect(form.group).toBe('Genomics lab')
    expect(form.visibility).toBe('group')
    expect(form.entities.some((entity) => entity.locked)).toBe(true)
  })

  it('refuses a group the user is not in and a made-up visibility', () => {
    expect(bridge.setBasics({ group: 'Other lab' })).toContain('No group named')
    expect(bridge.setBasics({ visibility: 'secret' })).toBe('Visibility is "public" or "group".')
  })

  it('adds an entity rule and a property rule on it', () => {
    expect(bridge.addEntity({ type: 'Person' })).toBeNull()
    expect(bridge.addProperty({ entity: 'Person', name: 'ORCID', obligation: 'SHOULD', kind: 'url' })).toBeNull()

    const person = bridge.summary().entities.find((entity) => entity.label === 'Person')
    expect(person?.properties.map((property) => property.name)).toEqual(['name', 'orcid'])
    expect(person?.properties[1]).toMatchObject({ obligation: 'SHOULD', kind: 'url' })
  })

  it('names what is wrong with a property rule instead of adding it', () => {
    bridge.addEntity({ type: 'Person' })

    expect(bridge.addProperty({ entity: 'Vehicle', name: 'x' })).toContain('no rule for "Vehicle"')
    expect(bridge.addProperty({ entity: 'Person', name: 'name' })).toContain('already a rule')
    expect(bridge.addProperty({ entity: 'Person', name: 'age', obligation: 'MAYBE' })).toBe('Obligation is MUST, SHOULD or MAY.')
    expect(bridge.addProperty({ entity: 'Person', name: 'boss', kind: 'entity' })).toContain('target_type')
  })

  it('keeps the baseline and undoes the last change', () => {
    const root = bridge.summary().entities.find((entity) => entity.locked)
    expect(bridge.removeEntity(root?.type ?? '')).toContain('stays')

    bridge.snapshot()
    bridge.addEntity({ type: 'Organization' })
    expect(bridge.summary().entities.some((entity) => entity.label === 'Organization')).toBe(true)

    expect(bridge.undo()).toBe(true)
    expect(bridge.summary().entities.some((entity) => entity.label === 'Organization')).toBe(false)
    expect(bridge.undo()).toBe(false)
  })
})
