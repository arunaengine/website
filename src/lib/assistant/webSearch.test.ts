import { describe, expect, it } from 'vitest'
import { refusedExtras, searchKind, searchTools } from './webSearch'

describe('provider web search', () => {
  it('picks the tool the provider actually offers', () => {
    expect(searchKind({ kind: 'anthropic', responses: false })).toBe('anthropic')
    expect(searchKind({ kind: 'openai_compatible', responses: true })).toBe('openai')
    // Chat completions has no server tool, and the ChatGPT proxy takes none.
    expect(searchKind({ kind: 'openai_compatible', responses: false })).toBe('none')
    expect(searchKind({ kind: 'chatgpt', responses: true })).toBe('none')
  })

  it('follows what a compatible model reports, and the provider choice over that', () => {
    const compatible = { kind: 'openai_compatible', responses: true }

    expect(searchKind({ ...compatible, webSearch: true })).toBe('openai')
    expect(searchKind({ ...compatible, webSearch: false })).toBe('none')
    expect(searchKind({ ...compatible, webSearch: false, choice: 'on' })).toBe('openai')
    expect(searchKind({ ...compatible, webSearch: true, choice: 'off' })).toBe('none')
    expect(searchKind({ ...compatible, choice: 'on', responses: false })).toBe('none')
  })

  it('reads which extras a 400 refused', () => {
    // The live refusal lists reasoning among the allowed include values; only
    // the search extras were refused there.
    const include = "400: Bad Request: body.include.0: Input should be 'code_interpreter_call.outputs', "
      + "'reasoning.encrypted_content'; input: 'web_search_call.action.sources'"

    expect(refusedExtras(include)).toEqual({ search: true, reasoning: false })
    expect(refusedExtras("400: Bad Request: Unknown parameter: 'reasoning.effort'")).toEqual({ search: false, reasoning: true })
    expect(refusedExtras('400: Bad Request: model not found')).toBeNull()
    expect(refusedExtras('500: include failed')).toBeNull()
    expect(refusedExtras(undefined)).toBeNull()
  })

  it('declares one tool under the name the provider expects', async () => {
    expect(Object.keys(await searchTools('anthropic'))).toEqual(['web_search'])
    expect(Object.keys(await searchTools('openai'))).toEqual(['web_search'])
    expect(await searchTools('none')).toEqual({})
  })
})
