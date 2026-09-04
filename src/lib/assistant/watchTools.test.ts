import { describe, expect, it, vi } from 'vitest'
import { watchTools } from './watchTools'
import type { WatchResult } from './watchers'

function bridge(result: WatchResult = { ok: true, message: 'Watching the job 01JOB.' }) {
  return { watch: vi.fn(() => result) }
}

async function call(tools: ReturnType<typeof watchTools>, input: unknown) {
  const entry = tools.watch_progress
  if (!entry?.execute) throw new Error('No watch_progress tool')
  return entry.execute(input as never, { toolCallId: 't-1', messages: [], context: undefined })
}

describe('watch_progress', () => {
  it('registers the watch and answers at once', async () => {
    const watcher = bridge()

    const answer = await call(watchTools(watcher), { kind: 'job', id: ' 01JOB ', label: 'GC content' })

    expect(watcher.watch).toHaveBeenCalledWith({ kind: 'job', target: '01JOB', label: 'GC content' })
    expect(answer).toEqual({ watching: true, note: 'Watching the job 01JOB.' })
  })

  it('falls back to the id when the model names nothing', async () => {
    const watcher = bridge()

    await call(watchTools(watcher), { kind: 'sync', id: 'sync-1' })

    expect(watcher.watch).toHaveBeenCalledWith({ kind: 'sync', target: 'sync-1', label: 'sync-1' })
  })

  it('refuses a kind it cannot watch', async () => {
    const watcher = bridge()

    const answer = await call(watchTools(watcher), { kind: 'bucket', id: 'b-1' })

    expect(watcher.watch).not.toHaveBeenCalled()
    expect(answer).toMatchObject({ watching: false })
  })

  it('refuses a call without an id', async () => {
    const watcher = bridge()

    const answer = await call(watchTools(watcher), { kind: 'job', id: '  ' })

    expect(watcher.watch).not.toHaveBeenCalled()
    expect(answer).toMatchObject({ watching: false })
  })

  it('passes a refusal from the registry back to the model', async () => {
    const watcher = bridge({ ok: false, message: 'Too many watches.' })

    const answer = await call(watchTools(watcher), { kind: 'job', id: '01JOB' })

    expect(answer).toEqual({ watching: false, note: 'Too many watches.' })
  })
})
