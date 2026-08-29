// Ready-to-paste configuration for the MCP clients that accept a static bearer
// over Streamable HTTP. The token is a session the user minted for that client.

export interface McpSnippet {
  id: string
  title: string
  /** Where the snippet goes, or the command to run. */
  hint: string
  language: 'shell' | 'json' | 'toml'
  code: string
}

const PLACEHOLDER = '<paste the session token>'

function bearer(token: string): string {
  return `Bearer ${token || PLACEHOLDER}`
}

export function mcpSnippets(url: string, token: string): McpSnippet[] {
  const authorization = bearer(token)
  return [
    {
      id: 'claude-code',
      title: 'Claude Code',
      hint: 'Run this once in a terminal.',
      language: 'shell',
      code: `claude mcp add --transport http aruna ${url} --header "Authorization: ${authorization}"`,
    },
    {
      id: 'mcp-json',
      title: 'Cursor, VS Code, Windsurf',
      hint: "Add to the editor's mcp.json.",
      language: 'json',
      code: JSON.stringify(
        { mcpServers: { aruna: { url, headers: { Authorization: authorization } } } },
        null,
        2,
      ),
    },
    {
      id: 'codex',
      title: 'Codex CLI',
      hint: 'Run the command, then add the header to ~/.codex/config.toml.',
      language: 'toml',
      code: [
        `codex mcp add aruna --url ${url}`,
        '',
        '[mcp_servers.aruna]',
        `url = "${url}"`,
        `http_headers = { Authorization = "${authorization}" }`,
      ].join('\n'),
    },
    {
      id: 'gemini',
      title: 'Gemini CLI',
      hint: 'Add to ~/.gemini/settings.json.',
      language: 'json',
      code: JSON.stringify(
        { mcpServers: { aruna: { httpUrl: url, headers: { Authorization: authorization } } } },
        null,
        2,
      ),
    },
  ]
}
