import { describe, expect, it } from 'vitest'
import { CHATGPT_MODELS, isValidModelId, modelSuggestions, normalizeModelId } from './modelOptions'

describe('modelSuggestions', () => {
  it('lists the fetched models first, then the stored ones, once each', () => {
    const suggestions = modelSuggestions(
      { kind: 'openai', models: [{ id: 'gpt-5' }, { id: 'o-mini' }], default_model: 'custom-1' },
      [{ id: 'gpt-5', display_name: 'GPT 5' }, { id: 'gpt-5.5' }],
    )
    expect(suggestions.map((model) => model.id)).toEqual(['gpt-5', 'gpt-5.5', 'o-mini', 'custom-1'])
    expect(suggestions[0].display_name).toBe('GPT 5')
  })

  it('falls back to the gpt-5 family for a ChatGPT subscription without a list', () => {
    // The node answers the static set when the backend does not list models.
    expect(modelSuggestions({ kind: 'chatgpt', models: [] })).toEqual(CHATGPT_MODELS)
    expect(modelSuggestions({ kind: 'chatgpt', models: [{ id: 'gpt-5.7' }] }).map((model) => model.id)).toEqual(['gpt-5.7'])
    expect(modelSuggestions({ kind: 'anthropic', models: [] })).toEqual([])
  })

  it('accepts any non-empty id and drops the whitespace around it', () => {
    expect(isValidModelId('  my-fine-tune ')).toBe(true)
    expect(isValidModelId('   ')).toBe(false)
    expect(normalizeModelId('  my-fine-tune ')).toBe('my-fine-tune')
  })
})
