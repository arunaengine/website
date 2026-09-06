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
  /** What the model entry reports for a compatible endpoint; unset is unknown. */
  webSearch?: boolean
  /** The provider's own choice, which wins over the report. */
  choice?: 'on' | 'off'
}

// The ChatGPT subscription surface is left out: its proxy accepts only the
// Responses paths Codex uses, and a rejected tool would fail the whole turn.
// A compatible endpoint gets the tool unless its model or provider says no;
// an unknown model tries once, and a refusal is remembered on the model.
export function searchKind(support: SearchSupport): SearchKind {
  if (support.kind === 'anthropic') return 'anthropic'
  if (support.kind === 'chatgpt' || !support.responses) return 'none'
  if (support.kind !== 'openai_compatible') return 'openai'
  if (support.choice) return support.choice === 'on' ? 'openai' : 'none'
  return support.webSearch === false ? 'none' : 'openai'
}

/** Which extras a 400 from the endpoint refused, read from its reason. */
export interface RefusedExtras {
  search: boolean
  reasoning: boolean
}

// A refusal of `include` lists the allowed values, which name reasoning too,
// so reasoning counts as refused only when the search extras are not.
export function refusedExtras(error: string | undefined): RefusedExtras | null {
  if (!error || !/^400\b/.test(error)) return null
  const search = /\binclude\b|web_search/i.test(error)
  const reasoning = !search && /reasoning/i.test(error)
  return search || reasoning ? { search, reasoning } : null
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
