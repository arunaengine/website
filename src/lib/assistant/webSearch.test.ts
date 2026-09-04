import { describe, expect, it } from 'vitest'
import { searchKind, searchTools } from './webSearch'

describe('provider web search', () => {
  it('picks the tool the provider actually offers', () => {
    expect(searchKind({ kind: 'anthropic', responses: false })).toBe('anthropic')
    expect(searchKind({ kind: 'openai_compatible', responses: true })).toBe('openai')
    // Chat completions has no server tool, and the ChatGPT proxy takes none.
    expect(searchKind({ kind: 'openai_compatible', responses: false })).toBe('none')
    expect(searchKind({ kind: 'chatgpt', responses: true })).toBe('none')
  })

  it('declares one tool under the name the provider expects', async () => {
    expect(Object.keys(await searchTools('anthropic'))).toEqual(['web_search'])
    expect(Object.keys(await searchTools('openai'))).toEqual(['web_search'])
    expect(await searchTools('none')).toEqual({})
  })
})
