import { describe, expect, it, vi } from 'vitest'
import { profileFormTools, type ProfileFormBridge, type ProfileFormSummary } from '@/lib/assistant/profileFormTools'
import { DENIAL_MESSAGE, type ApprovalGate } from '@/lib/assistant/types'

const SUMMARY: ProfileFormSummary = {
  name: 'Sequencing runs',
  slug: 'sequencing-runs',
  description: '',
  version: '0.1.0',
  license: 'CC-BY-4.0',
  group: 'Genomics lab',
  visibility: 'public',
  entities: [{ type: 'https://schema.org/Dataset', label: 'Root dataset', locked: true, properties: [] }],
  problems: ['Add a description'],
}

function bridge(overrides: Partial<ProfileFormBridge> = {}) {
  return {
    summary: vi.fn(() => SUMMARY),
    snapshot: vi.fn(),
    undo: vi.fn(() => true),
    setBasics: vi.fn(() => null),
    addEntity: vi.fn(() => null),
    addProperty: vi.fn(() => null),
    removeProperty: vi.fn(() => null),
    removeEntity: vi.fn(() => null),
    ...overrides,
  } satisfies ProfileFormBridge & Record<string, unknown>
}

function gate(approve = true, enabled = true): ApprovalGate {
  return { enabled: () => enabled, ask: async () => approve }
}

async function call(tools: ReturnType<typeof profileFormTools>, name: string, input: unknown) {
  const entry = tools[name]
  if (!entry?.execute) throw new Error(`No tool ${name}`)
  return entry.execute(input as never, { toolCallId: 'call-1', messages: [], context: undefined })
}

describe('profile form tools', () => {
  it('offers reading, the writers and one undo', () => {
    expect(Object.keys(profileFormTools(bridge(), gate())).sort()).toEqual([
      'add_profile_entity',
      'add_profile_property',
      'read_profile_form',
      'remove_profile_entity',
      'remove_profile_property',
      'set_profile_basics',
      'undo_profile_change',
    ])
  })

  it('reads the form without asking', async () => {
    const form = bridge()
    expect(await call(profileFormTools(form, gate(false)), 'read_profile_form', {})).toEqual(SUMMARY)
    expect(form.snapshot).not.toHaveBeenCalled()
  })

  it('snapshots before a write and answers what still blocks the profile', async () => {
    const form = bridge()
    const output = await call(profileFormTools(form, gate()), 'add_profile_property', {
      entity: 'Dataset',
      name: 'sampleId',
      obligation: 'MUST',
    })

    expect(form.snapshot).toHaveBeenCalledTimes(1)
    expect(form.addProperty).toHaveBeenCalledWith({ entity: 'Dataset', name: 'sampleId', obligation: 'MUST' })
    expect(output).toEqual({ applied: true, problems: ['Add a description'] })
  })

  it('answers a denial without touching the form', async () => {
    const form = bridge()
    const output = await call(profileFormTools(form, gate(false)), 'set_profile_basics', { name: 'x' })

    expect(output).toEqual({ error: DENIAL_MESSAGE })
    expect(form.setBasics).not.toHaveBeenCalled()
  })

  it('hands a bridge refusal back as the error', async () => {
    const form = bridge({ addEntity: vi.fn(() => 'An entity rule needs a type.') })
    expect(await call(profileFormTools(form, gate()), 'add_profile_entity', { type: ' ' }))
      .toEqual({ error: 'An entity rule needs a type.' })
  })

  it('undoes once and says when there is nothing left', async () => {
    const form = bridge({ undo: vi.fn(() => false) })
    expect(await call(profileFormTools(form, gate()), 'undo_profile_change', {}))
      .toEqual({ undone: false, note: 'There is nothing to undo.' })
  })
})
