import { describe, expect, it, vi } from 'vitest'
import { dynamicTool, jsonSchema } from 'ai'
import { isWriteTool, mergeTools, nodeTools, type McpToolDescriptor } from './tools'
import { DENIAL_MESSAGE, type ApprovalGate } from './types'
import { runTool } from '@/test/aiTool'

const READER: McpToolDescriptor = {
  name: 'list_buckets',
  description: 'Lists buckets',
  inputSchema: { type: 'object', properties: { prefix: { type: 'string' } } },
  annotations: { readOnlyHint: true },
}
const WRITER: McpToolDescriptor = {
  name: 'write_object',
  inputSchema: { type: 'object', properties: {} },
  annotations: { title: 'Write an object' },
}

function source(result: unknown = { ok: true }) {
  return {
    listTools: vi.fn(async () => [READER, WRITER]),
    callTool: vi.fn(async (_name: string, _input: Record<string, unknown>) => result),
  }
}

function stub(description: string) {
  return dynamicTool({
    description,
    inputSchema: jsonSchema({ type: 'object', properties: {} }),
    execute: async () => ({}),
  })
}

function gate(enabled: boolean, approve = true): ApprovalGate & { ask: ReturnType<typeof vi.fn> } {
  return {
    enabled: () => enabled,
    ask: vi.fn(async () => approve),
  }
}

describe('isWriteTool', () => {
  it('treats a tool without readOnlyHint as a write', () => {
    // A server that says nothing must not be assumed harmless.
    expect(isWriteTool(WRITER)).toBe(true)
    expect(isWriteTool(READER)).toBe(false)
    expect(isWriteTool({ name: 'x', annotations: { readOnlyHint: false } })).toBe(true)
  })
})

describe('nodeTools', () => {
  it('maps every server tool with its description and schema', () => {
    const tools = nodeTools([READER, WRITER], source(), gate(true))

    expect(Object.keys(tools)).toEqual(['list_buckets', 'write_object'])
    expect(tools.list_buckets.description).toBe('Lists buckets')
    // No description on the server: the annotation title stands in.
    expect(tools.write_object.description).toBe('Write an object')
    expect(tools.list_buckets.inputSchema).toBeDefined()
  })

  it('runs a read tool without asking, whatever the toggle says', async () => {
    const transport = source({ buckets: [] })
    const approval = gate(true)
    const tools = nodeTools([READER], transport, approval)

    const output = await runTool(tools.list_buckets, { prefix: 'a' })

    expect(approval.ask).not.toHaveBeenCalled()
    expect(transport.callTool).toHaveBeenCalledWith('list_buckets', { prefix: 'a' })
    expect(output).toEqual({ buckets: [] })
  })

  it('asks before a write and runs it once approved', async () => {
    const transport = source()
    const approval = gate(true)
    const tools = nodeTools([WRITER], transport, approval)

    await runTool(tools.write_object, { key: 'k' }, 'call-1')

    expect(approval.ask).toHaveBeenCalledWith({ id: 'call-1', name: 'write_object', input: { key: 'k' } }, false)
    expect(transport.callTool).toHaveBeenCalledOnce()
  })

  it('answers a denial to the model and never calls the node', async () => {
    const transport = source()
    const approval = gate(true, false)
    const tools = nodeTools([WRITER], transport, approval)

    const output = await runTool(tools.write_object, {})

    expect(output).toEqual({ error: DENIAL_MESSAGE })
    expect(transport.callTool).not.toHaveBeenCalled()
  })

  it('skips the approval card while the toggle is off', async () => {
    const transport = source()
    const approval = gate(false)
    const tools = nodeTools([WRITER], transport, approval)

    await runTool(tools.write_object, {})

    expect(approval.ask).not.toHaveBeenCalled()
    expect(transport.callTool).toHaveBeenCalledOnce()
  })
})

describe('mergeTools', () => {
  it('lets an editor tool win over a node tool of the same name', () => {
    const node = nodeTools([READER, WRITER], source(), gate(false))
    const merged = mergeTools(node, { write_object: stub('editor') })

    expect(Object.keys(merged)).toEqual(['list_buckets', 'write_object'])
    expect(merged.write_object.description).toBe('editor')
  })
})
