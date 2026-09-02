import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  built: [] as Array<{ info: unknown; options: { jsonSchemaValidator?: unknown } | undefined }>,
  listTools: vi.fn(),
  callTool: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    constructor(info: unknown, options?: { jsonSchemaValidator?: unknown }) {
      sdk.built.push({ info, options })
    }

    connect = vi.fn(async () => {})
    listTools = sdk.listTools
    callTool = sdk.callTool
    close = vi.fn(async () => {})
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    constructor(readonly url: URL, readonly options: unknown) {}
  },
}))

const { connectMcp, shapeValidator } = await import('./mcpClient')

beforeEach(() => {
  sdk.built.length = 0
  sdk.listTools.mockReset()
  sdk.callTool.mockReset()
})

describe('MCP client', () => {
  it('validates tool output without compiling a schema', async () => {
    // Ajv's generated validators need `new Function`, which the CSP forbids.
    sdk.listTools.mockResolvedValue({ tools: [] })
    await connectMcp('https://node.example/mcp', 'token')

    const supplied = sdk.built[0].options?.jsonSchemaValidator as typeof shapeValidator
    const validate = supplied.getValidator({ type: 'object' })

    expect(validate({ ok: true })).toEqual({ valid: true, data: { ok: true }, errorMessage: undefined })
    expect(validate('text').valid).toBe(false)
    expect(validate([]).valid).toBe(false)
  })

  it('accepts anything a schema without an object type describes', () => {
    expect(shapeValidator.getValidator({ type: 'string' })(42).valid).toBe(true)
  })

  it('maps the listed tools to descriptors', async () => {
    sdk.listTools.mockResolvedValue({
      tools: [
        { name: 'search', description: 'Find data', inputSchema: { type: 'object' } },
        { description: 'nameless' },
        { name: 'read', annotations: { readOnlyHint: true } },
      ],
    })
    const connection = await connectMcp('https://node.example/mcp', 'token')

    expect(await connection.listTools()).toEqual([
      { name: 'search', description: 'Find data', inputSchema: { type: 'object' }, annotations: undefined },
      { name: 'read', description: undefined, inputSchema: undefined, annotations: { readOnlyHint: true } },
    ])
  })

  it('hands back the structured content of a call', async () => {
    sdk.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ignored' }], structuredContent: { hits: 2 } })
    const connection = await connectMcp('https://node.example/mcp', 'token')

    expect(await connection.callTool('search', { q: 'x' })).toEqual({ hits: 2 })
  })

  it('describes an image-only result instead of handing over its bytes', async () => {
    // The raw envelope would put base64 image data into the model's context.
    const data = 'QUJDRA'.repeat(20)
    sdk.callTool.mockResolvedValue({ content: [{ type: 'image', mimeType: 'image/png', data }] })
    const connection = await connectMcp('https://node.example/mcp', 'token')

    const output = await connection.callTool('render', {})

    expect(JSON.stringify(output)).not.toContain(data.slice(0, 12))
    expect(output).toEqual({ content: [{ type: 'image', mimeType: 'image/png', bytes: 90 }] })
  })

  it('names a linked resource by its uri', async () => {
    sdk.callTool.mockResolvedValue({
      content: [{ type: 'resource_link', uri: 's3://work/chart.png', name: 'chart.png' }],
    })
    const connection = await connectMcp('https://node.example/mcp', 'token')

    expect(await connection.callTool('outputs', {})).toEqual({
      content: [{ type: 'resource_link', uri: 's3://work/chart.png', name: 'chart.png' }],
    })
  })
})
