// Marks a run the assistant submitted, in the portal rather than in the model,
// so the mark can be neither forgotten nor forged. The keys avoid the
// `aruna-engine.org/label/` namespace, where a tag demands a node label.
import type { McpToolSource } from './tools'

export const ASSISTANT_TAG_PREFIX = 'aruna-engine.org/assistant/'
/** The two ways the model starts a run: submit_job tags its spec, run_script tags itself. */
export const SUBMIT_TOOL = 'submit_job'
export const SCRIPT_TOOL = 'run_script'

const MAX_TAG_LENGTH = 200

export interface RunProvenance {
  model: string
  chatId: string
}

export function provenanceTags(info: RunProvenance): Record<string, string> {
  const tags: Record<string, string> = { [`${ASSISTANT_TAG_PREFIX}created-by`]: 'portal-assistant' }
  if (info.model.trim()) tags[`${ASSISTANT_TAG_PREFIX}model`] = info.model.trim().slice(0, MAX_TAG_LENGTH)
  if (info.chatId.trim()) tags[`${ASSISTANT_TAG_PREFIX}chat`] = info.chatId.trim().slice(0, MAX_TAG_LENGTH)
  return tags
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function tagged(fields: Record<string, unknown>, info: RunProvenance): Record<string, unknown> {
  const tags = record(fields.tags) ? fields.tags : {}
  return { ...fields, tags: { ...tags, ...provenanceTags(info) } }
}

/** Adds the provenance to the spec the model sends; anything else is untouched. */
export function taggedSubmit(input: Record<string, unknown>, info: RunProvenance): Record<string, unknown> {
  if (!record(input.spec)) return input
  return { ...input, spec: tagged(input.spec, info) }
}

export function withRunProvenance(source: McpToolSource, info: RunProvenance): McpToolSource {
  return {
    listTools: () => source.listTools(),
    callTool(name, input) {
      if (name === SUBMIT_TOOL) return source.callTool(name, taggedSubmit(input, info))
      if (name === SCRIPT_TOOL) return source.callTool(name, tagged(input, info))
      return source.callTool(name, input)
    },
  }
}
