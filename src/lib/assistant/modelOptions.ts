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

// --- Reasoning effort levels ---
// The node lists the levels a model accepts; when it lists none the client
// falls back to a family catalog mirroring the node, then to this default set.
export const DEFAULT_REASONING_EFFORTS: readonly string[] = ['minimal', 'low', 'medium', 'high']

const CODEX_FLAGSHIP_EFFORTS: readonly string[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const CODEX_EFFORTS: readonly string[] = ['minimal', 'low', 'medium', 'high', 'xhigh']
const OPENAI_EFFORTS: readonly string[] = ['low', 'medium', 'high']

function isOpenAiReasoning(id: string): boolean {
  return id.startsWith('o3') || id.startsWith('o4') || id.startsWith('gpt-5')
}

/** Levels a model family accepts when the node lists none; empty otherwise. */
export function familyEfforts(kind: string, id: string): string[] {
  if (kind === 'chatgpt') {
    if (id.startsWith('gpt-5.6')) return [...CODEX_FLAGSHIP_EFFORTS]
    return id.startsWith('gpt-5') ? [...CODEX_EFFORTS] : []
  }
  return isOpenAiReasoning(id) ? [...OPENAI_EFFORTS] : []
}

/** The levels to offer: what the model lists, else its family, else the default. */
export function reasoningEffortOptions(kind: string, id: string, listed?: readonly string[]): string[] {
  if (listed?.length) return [...listed]
  const family = familyEfforts(kind, id)
  return family.length ? family : [...DEFAULT_REASONING_EFFORTS]
}

/** The list's preferred default: medium when offered, else its middle element. */
export function preferredEffort(options: readonly string[]): string {
  if (options.includes('medium')) return 'medium'
  return options[Math.floor(options.length / 2)] ?? 'medium'
}

/** The stored effort when the model offers it, else the preferred default. */
export function clampEffort(stored: string, options: readonly string[]): string {
  return options.includes(stored) ? stored : preferredEffort(options)
}

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max',
  ultra: 'Ultra',
  none: 'None',
}

/** A raw effort value as a display label; an unknown value is title-cased. */
export function effortLabel(value: string): string {
  return EFFORT_LABELS[value] ?? (value ? value[0].toUpperCase() + value.slice(1) : value)
}
