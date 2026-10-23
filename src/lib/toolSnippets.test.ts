import { describe, expect, it } from 'vitest'
import { nextflowSnippet, nodeOrigin, tesAddress, toolSnippet } from './toolSnippets'

const key = { accessKeyId: 'ARK1', secret: 'S3CR3T' }

describe('tool snippets', () => {
  it('uses the address the node reported and the new key', () => {
    const text = toolSnippet('aws', 'http://127.0.0.1:9100', key)

    expect(text).toContain('aws_access_key_id ARK1')
    expect(text).toContain('aws_secret_access_key S3CR3T')
    expect(text).toContain('--endpoint-url http://127.0.0.1:9100')
    expect(toolSnippet('rclone', 'http://127.0.0.1:9100', key)).toContain('endpoint = http://127.0.0.1:9100')
    expect(toolSnippet('python', 'http://127.0.0.1:9100', key)).toContain('endpoint_url="http://127.0.0.1:9100"')
  })

  it('keeps the placeholders until a key exists', () => {
    const text = toolSnippet('python', 'http://127.0.0.1:9100', null)

    expect(text).toContain('YOUR_KEY_ID')
    expect(text).toContain('YOUR_SECRET')
  })

  it('prints no port when the node reported no address', () => {
    for (const tool of ['aws', 'rclone', 'python'] as const) {
      expect(toolSnippet(tool, null, null)).toContain('ADDRESS_OF_THIS_COMPUTER')
      expect(toolSnippet(tool, null, null)).not.toMatch(/:\d{4,5}/)
    }
  })

  it('points the assistant at the address the node reported for it', () => {
    expect(toolSnippet('assistant', null, null, 'http://127.0.0.1:9000/mcp')).toContain('http://127.0.0.1:9000/mcp')
  })

  it('writes the Nextflow lines against the local job address', () => {
    expect(nextflowSnippet('http://127.0.0.1:9000/api/v1/ga4gh/tes/v1')).toBe(
      "# nextflow.config\nprocess.executor = 'tes'\ntes.endpoint = 'http://127.0.0.1:9000/api/v1/ga4gh/tes/v1'",
    )
  })

  it('derives the job address from the node API base', () => {
    expect(nodeOrigin('http://127.0.0.1:9000/api/v1')).toBe('http://127.0.0.1:9000')
    expect(tesAddress('http://127.0.0.1:9000/api/v1')).toBe('http://127.0.0.1:9000/api/v1/ga4gh/tes/v1')
    expect(tesAddress('http://127.0.0.1:9000/api/v1/')).toBe('http://127.0.0.1:9000/api/v1/ga4gh/tes/v1')
    expect(tesAddress(null)).toBeNull()
    expect(tesAddress('not a url')).toBeNull()
  })
})
