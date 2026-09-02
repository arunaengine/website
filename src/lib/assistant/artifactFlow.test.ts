// One chart, end to end on the portal side: the node tools a model would call
// in order, then the artifact card the last result produces.
import { describe, expect, it, vi } from 'vitest'
import { runTool } from '@/test/aiTool'
import type { McpToolDescriptor } from './tools'
import type { RenderView } from './types'

const s3 = vi.hoisted(() => ({
  hasActiveKey: { value: true },
  ensureSession: vi.fn(async () => {}),
  resolveObjectUrl: vi.fn(() => ({ nodeId: 'node-2' })),
  downloadUrl: vi.fn(async () => 'https://s3.node.test/work/chart.png?signature'),
  getObjectBlob: vi.fn(async () => new Blob([new Uint8Array(2048)], { type: 'image/png' })),
}))

vi.mock('@/composables/useS3', () => ({ useS3: () => s3, s3ErrorMessage: (err: unknown) => String(err) }))

vi.stubGlobal('window', {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
})
URL.createObjectURL = vi.fn(() => 'blob:aruna/chart')
URL.revokeObjectURL = vi.fn()

const { nodeTools, mergeTools } = await import('./tools')
const { renderTools } = await import('./renderTools')
const { toolOutput } = await import('./mcpClient')
const { loadArtifact } = await import('@/composables/useAssistantChat')

const OUTPUT = {
  job_id: 'job-1',
  execution_id: 'exec-1',
  bucket: 'work',
  key: 'results/run-1/chart.png',
  version_id: 'v-9',
  filename: 'chart.png',
  container_path: '/work/chart.png',
  content_type: 'image/png',
  size: 2048,
  node_id: 'node-2',
  endpoint_url: 'https://s3.node.test',
}

// What the node answers, in the order a model works through the run.
const RESULTS: Record<string, unknown> = {
  list_objects: { objects: [{ key: 'raw/reads.csv', size: 900 }], next_cursor: null },
  aggregate_objects: {
    bucket: 'work',
    prefix: 'raw/',
    bucket_by: 'day',
    buckets: [{ start: '2026-09-01', count: 2, bytes: 900 }],
    total_count: 2,
    total_bytes: 900,
    scanned: 2,
    truncated: false,
  },
  run_script: { job_id: 'job-1', state: 'queued' },
  get_job: { job_id: 'job-1', state: 'succeeded' },
  list_job_outputs: { job_id: 'job-1', state: 'succeeded', workspace_bucket: 'work', outputs: [OUTPUT] },
}

const READERS = ['list_objects', 'aggregate_objects', 'get_job', 'list_job_outputs']

function descriptors(): McpToolDescriptor[] {
  return [...READERS, 'run_script'].map((name) => ({
    name,
    description: `${name} on the node`,
    inputSchema: { type: 'object', properties: {} },
    ...(READERS.includes(name) ? { annotations: { readOnlyHint: true } } : {}),
  }))
}

describe('a chart from a script run', () => {
  it('reaches the conversation as an image artifact', async () => {
    const called: string[] = []
    const source = {
      listTools: async () => descriptors(),
      callTool: async (name: string) => {
        called.push(name)
        return toolOutput({ content: [], structuredContent: RESULTS[name] })
      },
    }
    const kept: Array<[string, RenderView]> = []
    const ask = vi.fn(async () => true)
    const tools = mergeTools(
      nodeTools(descriptors(), source, { enabled: () => true, ask }),
      renderTools({
        keep: (id, view) => kept.push([id, view]),
        loadCrate: vi.fn(),
        loadArtifact,
      }),
    )

    await runTool(tools.list_objects, { bucket: 'work', prefix: 'raw/' })
    await runTool(tools.aggregate_objects, { bucket: 'work', prefix: 'raw/', bucket_by: 'day' })
    await runTool(tools.run_script, { bucket: 'work', runtime: 'python-uv', dependencies: ['matplotlib'] })
    const job = await runTool(tools.get_job, { id: 'job-1' }) as { state: string }
    expect(job.state).toBe('succeeded')

    const outputs = await runTool(tools.list_job_outputs, { id: 'job-1' }) as { outputs: typeof OUTPUT[] }
    const [produced] = outputs.outputs
    const shown = await runTool(tools.show_artifact, {
      bucket: produced.bucket,
      key: produced.key,
      version_id: produced.version_id,
      node_id: produced.node_id,
      endpoint_url: produced.endpoint_url,
      content_type: produced.content_type,
      filename: produced.filename,
      size: produced.size,
      job_id: produced.job_id,
      caption: 'Reads per day',
    }, 'call-art')

    expect(called).toEqual(['list_objects', 'aggregate_objects', 'run_script', 'get_job', 'list_job_outputs'])
    // Only the script submission is a write, so only it is asked about.
    expect(ask).toHaveBeenCalledOnce()
    expect(s3.getObjectBlob).toHaveBeenCalledWith('work', 'results/run-1/chart.png', 'node-2', 'v-9')
    expect(shown).toEqual({ shown: true, content_type: 'image/png', kind: 'image' })
    expect(kept).toEqual([['call-art', {
      kind: 'artifact',
      title: 'chart.png',
      caption: 'Reads per day',
      artifact: {
        url: 'blob:aruna/chart',
        contentType: 'image/png',
        previewKind: 'image',
        name: 'chart.png',
        size: 2048,
        bucket: 'work',
        key: 'results/run-1/chart.png',
        versionId: 'v-9',
        jobId: 'job-1',
      },
    }]])
  })
})
