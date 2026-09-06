import { describe, expect, it } from 'vitest'
import {
  emptyPipelineDraft,
  pipelineDraftFrom,
  pipelineRequest,
  pipelineSource,
} from './pipeline'

const context = { groupId: 'group-1', workspaceBucket: 'lab-data', idempotencyKey: 'cell-1' }

function draft() {
  return {
    ...emptyPipelineDraft(),
    name: 'align',
    image: 'ghcr.io/org/tool:1',
    command: 'tool --in /work/in --out /work/out/result.txt',
    inputs: [{ bucket: 'lab-data', key: 'data/reads.csv', path: '/work/in/reads.csv', name: 'reads.csv' }],
    outputs: [{ path: '/work/out/result.txt', key: 'data/result.txt' }],
  }
}

describe('pipelineRequest', () => {
  it('builds a job that works in the notebook bucket', () => {
    const mapping = pipelineRequest(draft(), context)
    expect('blocked' in mapping).toBe(false)
    if ('blocked' in mapping) return
    expect(mapping.request.workspace).toEqual({ mode: 'existing', bucket: 'lab-data' })
    expect(mapping.request.image).toBe('ghcr.io/org/tool:1')
    expect(mapping.request.command).toEqual(['tool', '--in', '/work/in', '--out', '/work/out/result.txt'])
    expect(mapping.request.outputs).toEqual([
      { container_path: '/work/out/result.txt', dest_key: 'data/result.txt', bucket: 'lab-data' },
    ])
    expect(mapping.request.idempotency_key).toBe('cell-1')
    expect(mapping.request.inputs).toEqual([
      {
        bucket: 'lab-data',
        key: 'data/reads.csv',
        dest_key: 'reads.csv',
        container_path: '/work/in/reads.csv',
        mode: 'snapshot',
      },
    ])
  })

  it('refuses a command that cannot be read', () => {
    const mapping = pipelineRequest({ ...draft(), command: 'tool "unclosed' }, context)
    expect('blocked' in mapping).toBe(true)
  })
})

describe('pipelineDraftFrom', () => {
  it('reads a stored cell back into the form', () => {
    const mapping = pipelineRequest(draft(), context)
    if ('blocked' in mapping) throw new Error(mapping.blocked)
    const again = pipelineDraftFrom(pipelineSource(mapping.request))
    expect(again.name).toBe('align')
    expect(again.image).toBe('ghcr.io/org/tool:1')
    expect(again.command).toBe('tool --in /work/in --out /work/out/result.txt')
    expect(again.outputs).toEqual([{ path: '/work/out/result.txt', key: 'data/result.txt' }])
    expect(again.inputs).toEqual([
      { bucket: 'lab-data', key: 'data/reads.csv', path: '/work/in/reads.csv', name: 'reads.csv' },
    ])
  })

  it('answers an empty form for text that is not a request', () => {
    expect(pipelineDraftFrom('not json').image).toBe('')
  })

  it('survives a stored cell with the wrong shapes', () => {
    const draft = pipelineDraftFrom(
      JSON.stringify({ command: 'tool', inputs: {}, outputs: [{ dest_key: 'a' }] }),
    )
    expect(draft.command).toBe('')
    expect(draft.inputs).toEqual([])
    expect(draft.outputs).toEqual([{ path: '', key: 'a' }])
  })
})
