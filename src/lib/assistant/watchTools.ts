// The tool that hands background work to the portal. It registers a watcher
// and answers at once: the chat is continued later, from the watcher, so the
// model must never sit in a polling loop waiting for a job or a sync.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import type { WatchKind, WatchResult } from './watchers'

export interface WatchBridge {
  watch(input: { kind: WatchKind; target: string; label: string }): WatchResult
}

interface WatchInput {
  kind: string
  id: string
  label?: string
}

export function watchTools(bridge: WatchBridge): ToolSet {
  return {
    watch_progress: tool({
      description:
        'Follows a running job or a bucket sync in the background and continues this chat on its own '
        + 'once it settles, even while the chat is closed. Use it instead of polling get_job in a loop: '
        + 'it returns immediately, so answer the user in the same turn and stop. Pass kind "job" with a '
        + 'job id, or kind "sync" with a sync relationship id, and a short label naming the work.',
      inputSchema: jsonSchema<WatchInput>({
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['job', 'sync'] },
          id: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['kind', 'id'],
      } as JSONSchema7),
      execute: (input) => {
        const target = input.id?.trim() ?? ''
        if (input.kind !== 'job' && input.kind !== 'sync') {
          return { watching: false, note: 'kind must be "job" or "sync".' }
        }
        if (!target) return { watching: false, note: 'Pass the id of the job or sync to watch.' }
        const result = bridge.watch({ kind: input.kind, target, label: input.label?.trim() || target })
        return { watching: result.ok, note: result.message }
      },
    }),
  }
}
