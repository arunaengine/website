// Streamable HTTP MCP client against this node's /mcp endpoint, authenticated
// with a child session of kind `assistant`. Only the two calls the tool layer
// needs are exposed, so the rest of the portal never sees the SDK types.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpToolDescriptor, McpToolSource } from './tools'

const CLIENT_INFO = { name: 'aruna-portal', version: '1' }

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

/**
 * What the model receives from a call: the structured content when the server
 * sent one, else the text blocks, and a plain error result for `isError`.
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
  return text || result
}

/** Connects and hands back the tool source; the caller closes it. */
export async function connectMcp(url: string, token: string): Promise<McpConnection> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  const client = new Client(CLIENT_INFO)
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
