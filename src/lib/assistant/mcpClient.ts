// Streamable HTTP MCP client against this node's /mcp endpoint, authenticated
// with a child session of kind `assistant`. Only the two calls the tool layer
// needs are exposed, so the rest of the portal never sees the SDK types.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  JsonSchemaType,
  JsonSchemaValidator,
  jsonSchemaValidator,
} from '@modelcontextprotocol/sdk/validation'
import type { McpToolDescriptor, McpToolSource } from './tools'

const CLIENT_INFO = { name: 'aruna-portal', version: '1' }

/**
 * The SDK's default validator compiles output schemas with `new Function`,
 * which the portal's CSP forbids. The node validates tool input itself and the
 * structured output comes from that same node, so a shape check is enough.
 */
export const shapeValidator: jsonSchemaValidator = {
  getValidator<T>(schema: JsonSchemaType): JsonSchemaValidator<T> {
    const wantsObject = (schema as { type?: unknown } | undefined)?.type === 'object'
    return (input: unknown) => {
      if (wantsObject && (typeof input !== 'object' || input === null || Array.isArray(input))) {
        return { valid: false, data: undefined, errorMessage: 'Expected a JSON object.' }
      }
      return { valid: true, data: input as T, errorMessage: undefined }
    }
  },
}

export interface McpConnection extends McpToolSource {
  close(): Promise<void>
}

function descriptors(tools: unknown): McpToolDescriptor[] {
  if (!Array.isArray(tools)) return []
  return tools.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const tool = entry as Record<string, unknown>
    if (typeof tool.name !== 'string') return []
    return [{
      name: tool.name,
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: (tool.inputSchema ?? undefined) as Record<string, unknown> | undefined,
      annotations: (tool.annotations ?? undefined) as McpToolDescriptor['annotations'],
    }]
  })
}

function base64Bytes(value: unknown): number {
  if (typeof value !== 'string') return 0
  return Math.floor((value.replace(/=+$/, '').length * 3) / 4)
}

/** A non-text block described rather than carried: bytes never reach the model. */
function blockSummary(block: Record<string, unknown>): Record<string, unknown> {
  const type = typeof block.type === 'string' ? block.type : 'unknown'
  if (type === 'resource_link') return { type, uri: block.uri, name: block.name }
  if (type === 'resource') {
    const resource = (block.resource ?? {}) as Record<string, unknown>
    if (typeof resource.text === 'string') return { type, uri: resource.uri, text: resource.text }
    return { type, uri: resource.uri, mimeType: resource.mimeType, bytes: base64Bytes(resource.blob) }
  }
  return { type, mimeType: block.mimeType, bytes: base64Bytes(block.data) }
}

/**
 * What the model receives from a call: the structured content when the server
 * sent one, else the text blocks, and a plain error result for `isError`. A
 * result carrying only images, audio or resources is described, never handed
 * over as base64.
 */
export function toolOutput(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  const call = result as Record<string, unknown>
  const blocks = Array.isArray(call.content) ? (call.content as Array<Record<string, unknown>>) : []
  const text = blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n')
  if (call.isError) return { error: text || 'The tool call failed.' }
  if (call.structuredContent !== undefined && call.structuredContent !== null) return call.structuredContent
  if (text) return text
  return { content: blocks.filter((block) => block?.type !== 'text').map(blockSummary) }
}

/** Connects and hands back the tool source; the caller closes it. */
export async function connectMcp(url: string, token: string): Promise<McpConnection> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  const client = new Client(CLIENT_INFO, { jsonSchemaValidator: shapeValidator })
  await client.connect(transport)
  return {
    async listTools() {
      return descriptors((await client.listTools()).tools)
    },
    async callTool(name, input) {
      return toolOutput(await client.callTool({ name, arguments: input }))
    },
    close() {
      return client.close()
    },
  }
}
