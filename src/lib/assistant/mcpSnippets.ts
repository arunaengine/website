// Ready-to-paste configuration for the MCP clients that accept a static bearer
// over Streamable HTTP. The token is a session the user minted for that client.

export type McpClientId = 'claude-code' | 'cursor' | 'vscode' | 'windsurf' | 'codex' | 'gemini' | 'generic'

export interface McpClient {
  id: McpClientId
  title: string
  /** Where the snippet goes, or the command to run. */
  hint: string
  language: 'shell' | 'json' | 'toml'
}

export interface McpSnippet extends McpClient {
  code: string
}

export const MCP_CLIENTS: readonly McpClient[] = [
  { id: 'claude-code', title: 'Claude Code', hint: 'Run this once in a terminal.', language: 'shell' },
  { id: 'cursor', title: 'Cursor', hint: 'Add to ~/.cursor/mcp.json, or to .cursor/mcp.json in a project.', language: 'json' },
  { id: 'vscode', title: 'VS Code', hint: 'Add to .vscode/mcp.json in the workspace.', language: 'json' },
  { id: 'windsurf', title: 'Windsurf', hint: 'Add to ~/.codeium/windsurf/mcp_config.json.', language: 'json' },
  { id: 'codex', title: 'Codex CLI', hint: 'Run the command, then add the header to ~/.codex/config.toml.', language: 'toml' },
  { id: 'gemini', title: 'Gemini CLI', hint: 'Add to ~/.gemini/settings.json.', language: 'json' },
  { id: 'generic', title: 'Other client', hint: 'For any client that reads an mcpServers map with headers.', language: 'json' },
]

const PLACEHOLDER = '<paste the session token>'

function bearer(token: string): string {
  return `Bearer ${token || PLACEHOLDER}`
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function code(client: McpClientId, url: string, authorization: string): string {
  const headers = { Authorization: authorization }
  switch (client) {
    case 'claude-code':
      return `claude mcp add --transport http aruna ${url} --header "Authorization: ${authorization}"`
    case 'vscode':
      return json({ servers: { aruna: { type: 'http', url, headers } } })
    case 'windsurf':
      return json({ mcpServers: { aruna: { serverUrl: url, headers } } })
    case 'codex':
      return [
        `codex mcp add aruna --url ${url}`,
        '',
        '[mcp_servers.aruna]',
        `url = "${url}"`,
        `http_headers = { Authorization = "${authorization}" }`,
      ].join('\n')
    case 'gemini':
      return json({ mcpServers: { aruna: { httpUrl: url, headers } } })
    case 'cursor':
    case 'generic':
      return json({ mcpServers: { aruna: { url, headers } } })
  }
}

export function mcpSnippet(url: string, token: string, client: McpClientId): McpSnippet {
  const found = MCP_CLIENTS.find((entry) => entry.id === client) ?? MCP_CLIENTS[0]
  return { ...found, code: code(found.id, url, bearer(token)) }
}

export function mcpSnippets(url: string, token: string): McpSnippet[] {
  return MCP_CLIENTS.map((client) => mcpSnippet(url, token, client.id))
}
