import { describe, expect, it } from 'vitest'
import { mcpSnippets } from './mcpSnippets'

const URL_ = 'https://node.example.org/mcp'

function snippet(id: string, token = 'tok-1') {
  const found = mcpSnippets(URL_, token).find((entry) => entry.id === id)
  if (!found) throw new Error(`no snippet ${id}`)
  return found
}

describe('mcpSnippets', () => {
  it('fills the url and bearer into the Claude Code command', () => {
    expect(snippet('claude-code').code).toBe(
      'claude mcp add --transport http aruna https://node.example.org/mcp --header "Authorization: Bearer tok-1"',
    )
  })

  it('emits mcp.json with a headers map for the editors', () => {
    const parsed = JSON.parse(snippet('mcp-json').code)
    expect(parsed.mcpServers.aruna).toEqual({
      url: URL_,
      headers: { Authorization: 'Bearer tok-1' },
    })
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
})
