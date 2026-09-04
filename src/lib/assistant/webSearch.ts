// Web search the provider runs itself. Anthropic and the OpenAI Responses API
// both offer it as a server tool, so the portal only declares it: no search
// key, no request of its own, and nothing to proxy.
import type { ToolSet } from 'ai'

export type SearchKind = 'anthropic' | 'openai' | 'none'

/** How many searches one turn may run before the model has to answer. */
export const MAX_SEARCHES = 5

export interface SearchSupport {
  /** The provider kind, as the record or the browser provider names it. */
  kind: string
  /** True when the model speaks the OpenAI Responses API. */
  responses: boolean
}

// The ChatGPT subscription surface is left out: its proxy accepts only the
// Responses paths Codex uses, and a rejected tool would fail the whole turn.
export function searchKind(support: SearchSupport): SearchKind {
  if (support.kind === 'anthropic') return 'anthropic'
  if (support.kind === 'chatgpt') return 'none'
  return support.responses ? 'openai' : 'none'
}

export async function searchTools(kind: SearchKind): Promise<ToolSet> {
  if (kind === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic')
    return { web_search: anthropic.tools.webSearch_20250305({ maxUses: MAX_SEARCHES }) }
  }
  if (kind === 'openai') {
    const { openai } = await import('@ai-sdk/openai')
    return { web_search: openai.tools.webSearch() }
  }
  return {}
}
