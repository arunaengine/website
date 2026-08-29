import { describe, expect, it } from 'vitest'
import { MCP_CLIENTS, mcpSnippet, mcpSnippets, type McpClientId } from './mcpSnippets'

const URL_ = 'https://node.example.org/mcp'

function snippet(id: McpClientId, token = 'tok-1') {
  return mcpSnippet(URL_, token, id)
}

describe('mcpSnippets', () => {
  it('fills the url and bearer into the Claude Code command', () => {
    expect(snippet('claude-code').code).toBe(
      'claude mcp add --transport http aruna https://node.example.org/mcp --header "Authorization: Bearer tok-1"',
    )
  })

  it('emits an mcpServers map with headers for Cursor and any other client', () => {
    for (const id of ['cursor', 'generic'] as const) {
      const parsed = JSON.parse(snippet(id).code)
      expect(parsed.mcpServers.aruna).toEqual({ url: URL_, headers: { Authorization: 'Bearer tok-1' } })
    }
  })

  it('uses the servers map with an http type for VS Code', () => {
    const parsed = JSON.parse(snippet('vscode').code)
    expect(parsed.servers.aruna).toEqual({ type: 'http', url: URL_, headers: { Authorization: 'Bearer tok-1' } })
    expect(parsed.mcpServers).toBeUndefined()
  })

  it('uses serverUrl for Windsurf', () => {
    const parsed = JSON.parse(snippet('windsurf').code)
    expect(parsed.mcpServers.aruna.serverUrl).toBe(URL_)
    expect(parsed.mcpServers.aruna.url).toBeUndefined()
  })

  it('uses httpUrl for the Gemini CLI', () => {
    const parsed = JSON.parse(snippet('gemini').code)
    expect(parsed.mcpServers.aruna.httpUrl).toBe(URL_)
    expect(parsed.mcpServers.aruna.url).toBeUndefined()
  })

  it('carries the Codex http_headers table', () => {
    const code = snippet('codex').code
    expect(code).toContain('codex mcp add aruna --url https://node.example.org/mcp')
    expect(code).toContain('http_headers = { Authorization = "Bearer tok-1" }')
  })

  it('shows a placeholder until a session token is minted', () => {
    // Copying a snippet before minting must not look like a working bearer.
    expect(snippet('claude-code', '').code).toContain('Bearer <paste the session token>')
  })

  it('lists one snippet per client, in the selector order', () => {
    expect(mcpSnippets(URL_, 'tok-1').map((entry) => entry.id)).toEqual(MCP_CLIENTS.map((client) => client.id))
  })
})
