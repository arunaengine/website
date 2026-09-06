import { describe, expect, it } from 'vitest'
import { buildRunTask, runExecutor, runResources } from './runTask'
import type { TesExecutor } from './tes'

const executor: TesExecutor = { image: 'alpine:3', command: ['echo', 'hi'], workdir: '/work' }

function draft() {
  return {
    name: 'counts',
    description: '',
    groupId: 'group-1',
    idempotencyKey: 'run-1',
    executor,
    inputs: [],
    outputs: [],
    resources: {},
  }
}

describe('runResources', () => {
  it('keeps empty fields empty', () => {
    expect(runResources({ cpuCores: '', ramGb: '  ', diskGb: '' })).toEqual({})
  })

  it('reads numbers and numeric text alike', () => {
    expect(runResources({ cpuCores: 2, ramGb: '4.5', diskGb: '10' })).toEqual({
      cpu_cores: 2,
      ram_gb: 4.5,
      disk_gb: 10,
    })
  })

  it('drops a value that is not a number', () => {
    expect(runResources({ cpuCores: 'two', ramGb: '', diskGb: '' })).toEqual({})
  })
})

describe('runExecutor', () => {
  it('trims the image and drops env rows without a key', () => {
    const built = runExecutor({
      image: '  alpine:3 ',
      command: ['echo'],
      env: [{ key: ' A ', value: '1' }, { key: '', value: '2' }],
      workdir: '/work',
    })
    expect(built).toEqual({ image: 'alpine:3', command: ['echo'], workdir: '/work', env: { A: '1' } })
  })

  it('leaves env out when no row carries a key', () => {
    const built = runExecutor({ image: 'alpine:3', command: [], env: [], workdir: '/work' })
    expect(built.env).toBeUndefined()
  })
})

describe('buildRunTask', () => {
  it('tags the owning group and the idempotency key', () => {
    const task = buildRunTask(draft())
    expect(task.tags).toEqual({
      'aruna-engine.org/group': 'group-1',
      'aruna-engine.org/idempotency-key': 'run-1',
    })
    expect(task.executors).toEqual([executor])
    expect(task.name).toBe('counts')
  })

  it('opens the network only when dependencies are declared', () => {
    expect(buildRunTask({ ...draft(), networkOpen: true }).tags?.['aruna-engine.org/network']).toBe('open')
    expect(buildRunTask(draft()).tags?.['aruna-engine.org/network']).toBeUndefined()
  })

  it('maps placement labels and the executor kind onto tags', () => {
    const task = buildRunTask({
      ...draft(),
      executorConstraint: ' docker ',
      placementLabels: { 'aruna-engine.org/node': 'node-a', region: 'eu' },
    })
    expect(task.tags?.['aruna-engine.org/executor']).toBe('docker')
    expect(task.tags?.['aruna-engine.org/label/aruna-engine.org/node']).toBe('node-a')
    expect(task.tags?.['aruna-engine.org/label/region']).toBe('eu')
  })

  it('drops empty inputs, outputs and resources', () => {
    const task = buildRunTask(draft())
    expect(task.inputs).toBeUndefined()
    expect(task.outputs).toBeUndefined()
    expect(task.resources).toBeUndefined()
  })
})
