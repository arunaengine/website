import { describe, expect, it, vi } from 'vitest'
import { runFormTools, type RunFormBridge, type RunFormSummary } from '@/lib/assistant/runFormTools'
import { DENIAL_MESSAGE, type ApprovalGate } from '@/lib/assistant/types'

const SUMMARY: RunFormSummary = {
  name: 'align-and-count',
  description: '',
  group: 'Genomics lab',
  executor: { mode: 'custom', image: 'alpine:3.20', command: 'echo hello', workdir: '/work' },
  script: null,
  inputs: [],
  outputs: [],
  resources: { cpuCores: '1', ramGb: '2', diskGb: '10' },
  placement: { target: 'realm', node: '', executorKind: '', constraints: [], matchingNodes: 3 },
  problems: [],
  unassignedPaths: [],
}

function bridge(overrides: Partial<RunFormBridge> = {}) {
  return {
    summary: vi.fn(() => SUMMARY),
    snapshot: vi.fn(),
    undo: vi.fn(() => true),
    setField: vi.fn(() => null),
    setExecutor: vi.fn(() => null),
    setScript: vi.fn(() => null),
    addInput: vi.fn(() => null),
    captureOutput: vi.fn(() => null),
    setResources: vi.fn(() => null),
    setPlacement: vi.fn(() => null),
    ...overrides,
  } satisfies RunFormBridge & Record<string, unknown>
}

function gate(approve = true, enabled = true): ApprovalGate {
  return { enabled: () => enabled, ask: async () => approve }
}

async function call(tools: ReturnType<typeof runFormTools>, name: string, input: unknown) {
  const entry = tools[name]
  if (!entry?.execute) throw new Error(`No tool ${name}`)
  return entry.execute(input as never, { toolCallId: 'call-1', messages: [], context: undefined })
}

describe('run form tools', () => {
  it('offers reading, the writers and one undo', () => {
    expect(Object.keys(runFormTools(bridge(), gate())).sort()).toEqual([
      'add_run_input',
      'capture_run_output',
      'read_run_form',
      'set_run_executor',
      'set_run_field',
      'set_run_placement',
      'set_run_resources',
      'set_run_script',
      'undo_run_change',
    ])
  })

  it('reads the form without asking', async () => {
    const api = bridge()
    const asked = vi.fn(async () => true)

    const result = await call(runFormTools(api, { enabled: () => true, ask: asked }), 'read_run_form', {})

    expect(result).toEqual(SUMMARY)
    expect(asked).not.toHaveBeenCalled()
  })

  it('snapshots before a write and answers with the new form', async () => {
    const api = bridge()

    const result = await call(runFormTools(api, gate()), 'set_run_field', { field: 'name', value: 'counts' })

    expect(api.snapshot).toHaveBeenCalledTimes(1)
    expect(api.setField).toHaveBeenCalledWith('name', 'counts')
    expect(result).toEqual(SUMMARY)
  })

  it('changes nothing when the gate says no', async () => {
    const api = bridge()

    const result = await call(runFormTools(api, gate(false)), 'set_run_resources', { cpu_cores: '4' })

    expect(result).toEqual({ error: DENIAL_MESSAGE })
    expect(api.snapshot).not.toHaveBeenCalled()
    expect(api.setResources).not.toHaveBeenCalled()
  })

  it('reports a refusal from the form instead of a change', async () => {
    const api = bridge({ addInput: vi.fn(() => 'An input needs a bucket and a key.') })

    const result = await call(runFormTools(api, gate()), 'add_run_input', { bucket: '', key: '' })

    expect(result).toEqual({ error: 'An input needs a bucket and a key.' })
  })

  it('skips the gate while approvals are off', async () => {
    const api = bridge()
    const asked = vi.fn(async () => true)

    await call(runFormTools(api, { enabled: () => false, ask: asked }), 'set_run_script', { text: 'print(1)' })

    expect(asked).not.toHaveBeenCalled()
    expect(api.setScript).toHaveBeenCalledWith('print(1)')
  })

  it('says so when there is nothing to undo', async () => {
    const api = bridge({ undo: vi.fn(() => false) })

    const result = await call(runFormTools(api, gate()), 'undo_run_change', {})

    expect(result).toEqual({ error: 'There is no applied change to undo.' })
  })

  it('never offers a tool that would send the run', () => {
    const names = Object.keys(runFormTools(bridge(), gate())).join(' ')
    expect(names).not.toContain('submit')
    expect(names).not.toContain('run_task')
  })
})
