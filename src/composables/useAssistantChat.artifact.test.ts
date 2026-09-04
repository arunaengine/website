// The text an artifact card carries: JSON is formatted, everything else is
// handed on byte for byte.
import { describe, expect, it, vi } from 'vitest'

const s3 = vi.hoisted(() => ({
  hasActiveKey: { value: true },
  ensureSession: vi.fn(async () => {}),
  resolveObjectUrl: vi.fn(() => ({ nodeId: 'node-2' })),
  downloadUrl: vi.fn(async () => 'https://s3.node.test/work/file?signature'),
  getObjectBlob: vi.fn(async () => new Blob([''])),
}))

vi.mock('@/composables/useS3', () => ({ useS3: () => s3, s3ErrorMessage: (err: unknown) => String(err) }))

vi.stubGlobal('window', {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
})
URL.createObjectURL = vi.fn(() => 'blob:aruna/file')
URL.revokeObjectURL = vi.fn()

const { loadArtifact } = await import('@/composables/useAssistantChat')

async function textOf(key: string, body: string, contentType: string): Promise<string | undefined> {
  s3.getObjectBlob.mockResolvedValueOnce(new Blob([body], { type: contentType }))
  const loaded = await loadArtifact({ bucket: 'work', key, contentType })
  return loaded.text
}

describe('loadArtifact', () => {
  it('formats json so the card is not one line', async () => {
    const text = await textOf('results/report.json', '{"a":1,"b":[2,3]}', 'application/json')

    expect(text).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n')
  })

  it('leaves text that is not json exactly as it is', async () => {
    const broken = await textOf('results/broken.json', '{"a":1,', 'application/json')
    const plain = await textOf('results/notes.txt', 'one\ntwo', 'text/plain')

    expect(broken).toBe('{"a":1,')
    expect(plain).toBe('one\ntwo')
  })
})
