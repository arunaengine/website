// Which model ids a provider offers: whatever the node listed for it, and the
// gpt-5 family to fall back on when OpenAI answers no listing at all. Any
// non-empty id is accepted beyond that.
import type { AssistantModel, AssistantProvider } from '@/lib/api'

export const OPENAI_MODELS: readonly AssistantModel[] = [
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5',
].map((id) => ({ id }))

export type ModelSource = Pick<AssistantProvider, 'kind' | 'models'> & { default_model?: string | null }

/** Suggestions in order: what was fetched, what is stored, the static set when nothing is known. */
export function modelSuggestions(provider: ModelSource, fetched: readonly AssistantModel[] = []): AssistantModel[] {
  const seen = new Set<string>()
  const out: AssistantModel[] = []
  const add = (model: AssistantModel) => {
    const id = model.id.trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({ ...model, id })
  }
  for (const model of fetched) add(model)
  for (const model of provider.models) add(model)
  if (provider.default_model) add({ id: provider.default_model })
  if (!out.length && provider.kind === 'chatgpt') for (const model of OPENAI_MODELS) add(model)
  return out
}

export function normalizeModelId(id: string): string {
  return id.trim()
}

export function isValidModelId(id: string): boolean {
  return normalizeModelId(id).length > 0
}
