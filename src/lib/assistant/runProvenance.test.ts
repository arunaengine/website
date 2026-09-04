import { describe, expect, it, vi } from 'vitest'
import { ASSISTANT_TAG_PREFIX, provenanceTags, taggedSubmit, withRunProvenance } from './runProvenance'
import type { McpToolSource } from './tools'

const info = { model: 'claude-sonnet-4', chatId: 'chat-7' }

function source(): McpToolSource & { calls: Array<{ name: string; input: Record<string, unknown> }> } {
  return {
    calls: [],
    listTools: vi.fn(async () => []),
    async callTool(name, input) {
      this.calls.push({ name, input })
      return { ok: true }
    },
  }
}

describe('provenanceTags', () => {
  it('stays out of the label namespace that would demand a node label', () => {
    for (const key of Object.keys(provenanceTags(info))) {
      expect(key.startsWith(ASSISTANT_TAG_PREFIX)).toBe(true)
      expect(key.startsWith('aruna-engine.org/label/')).toBe(false)
    }
  })

  it('never uses a reserved workspace key', () => {
    const keys = Object.keys(provenanceTags(info))
    expect(keys).not.toContain('aruna-engine.org/workspace-mode')
    expect(keys).not.toContain('aruna-engine.org/workspace-bucket')
  })

  it('names the assistant, the model and the chat', () => {
    expect(provenanceTags(info)).toEqual({
      [`${ASSISTANT_TAG_PREFIX}created-by`]: 'portal-assistant',
      [`${ASSISTANT_TAG_PREFIX}model`]: 'claude-sonnet-4',
      [`${ASSISTANT_TAG_PREFIX}chat`]: 'chat-7',
    })
  })

  it('leaves out a value the session does not have', () => {
    expect(Object.keys(provenanceTags({ model: '', chatId: '' }))).toEqual([`${ASSISTANT_TAG_PREFIX}created-by`])
  })
})

describe('taggedSubmit', () => {
  it('keeps the tags the model set beside the provenance', () => {
    const tagged = taggedSubmit(
      { spec: { group_id: 'g-1', tags: { 'aruna-engine.org/label/gpu': 'true' } } },
      info,
    )

    expect(tagged.spec).toMatchObject({
      group_id: 'g-1',
      tags: {
        'aruna-engine.org/label/gpu': 'true',
        [`${ASSISTANT_TAG_PREFIX}created-by`]: 'portal-assistant',
      },
    })
  })

  it('cannot be forged by the model', () => {
    const tagged = taggedSubmit(
      { spec: { tags: { [`${ASSISTANT_TAG_PREFIX}created-by`]: 'someone-else' } } },
      info,
    )

    expect((tagged.spec as { tags: Record<string, string> }).tags[`${ASSISTANT_TAG_PREFIX}created-by`])
      .toBe('portal-assistant')
  })

  it('leaves a call without a spec alone', () => {
    expect(taggedSubmit({ id: '01JOB' }, info)).toEqual({ id: '01JOB' })
  })
})

describe('withRunProvenance', () => {
  it('marks both ways of starting a run and nothing else', async () => {
    const inner = source()
    const tagged = withRunProvenance(inner, info)

    await tagged.callTool('submit_job', { spec: { group_id: 'g-1' } })
    await tagged.callTool('run_script', { group_id: 'g-1', script: 'print(1)', tags: { owner: 'me' } })
    await tagged.callTool('get_job', { id: '01JOB' })

    expect((inner.calls[0].input.spec as { tags: Record<string, string> }).tags)
      .toMatchObject({ [`${ASSISTANT_TAG_PREFIX}chat`]: 'chat-7' })
    expect(inner.calls[1].input).toMatchObject({
      group_id: 'g-1',
      script: 'print(1)',
      tags: { owner: 'me', [`${ASSISTANT_TAG_PREFIX}chat`]: 'chat-7' },
    })
    expect(inner.calls[2].input).toEqual({ id: '01JOB' })
  })
})
