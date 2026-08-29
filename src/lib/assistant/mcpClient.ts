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
    callTool(name, input) {
      return client.callTool({ name, arguments: input })
    },
    close() {
      return client.close()
    },
  }
}
