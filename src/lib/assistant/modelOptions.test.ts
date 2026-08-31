import { describe, expect, it } from 'vitest'
import {
  OPENAI_MODELS,
  clampEffort,
  effortLabel,
  familyEfforts,
  isValidModelId,
  modelSuggestions,
  normalizeModelId,
  preferredEffort,
  reasoningEffortOptions,
} from './modelOptions'

describe('modelSuggestions', () => {
  it('lists the fetched models first, then the stored ones, once each', () => {
    const suggestions = modelSuggestions(
      { kind: 'openai', models: [{ id: 'gpt-5' }, { id: 'o-mini' }], default_model: 'custom-1' },
      [{ id: 'gpt-5', display_name: 'GPT 5' }, { id: 'gpt-5.5' }],
    )
    expect(suggestions.map((model) => model.id)).toEqual(['gpt-5', 'gpt-5.5', 'o-mini', 'custom-1'])
    expect(suggestions[0].display_name).toBe('GPT 5')
  })

  it('falls back to the gpt-5 family for a Codex subscription without a list', () => {
    // The node answers the static set when the backend does not list models.
    expect(modelSuggestions({ kind: 'chatgpt', models: [] })).toEqual(OPENAI_MODELS)
    expect(modelSuggestions({ kind: 'chatgpt', models: [{ id: 'gpt-5.7' }] }).map((model) => model.id)).toEqual(['gpt-5.7'])
    expect(modelSuggestions({ kind: 'anthropic', models: [] })).toEqual([])
  })

  it('accepts any non-empty id and drops the whitespace around it', () => {
    expect(isValidModelId('  my-fine-tune ')).toBe(true)
    expect(isValidModelId('   ')).toBe(false)
    expect(normalizeModelId('  my-fine-tune ')).toBe('my-fine-tune')
  })
})

describe('reasoning efforts', () => {
  it('takes the levels the model lists first', () => {
    expect(reasoningEffortOptions('chatgpt', 'gpt-5.6-sol', ['low', 'high'])).toEqual(['low', 'high'])
  })

  it('falls back to the family, then the default set', () => {
    expect(reasoningEffortOptions('chatgpt', 'gpt-5.6-sol')).toEqual([
      'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra',
    ])
    expect(reasoningEffortOptions('chatgpt', 'gpt-5.5')).toEqual(['minimal', 'low', 'medium', 'high', 'xhigh'])
    expect(reasoningEffortOptions('openai', 'gpt-5')).toEqual(['low', 'medium', 'high'])
    expect(reasoningEffortOptions('anthropic', 'claude-3')).toEqual(['minimal', 'low', 'medium', 'high'])
  })

  it('offers nothing extra for a non-reasoning family', () => {
    expect(familyEfforts('openai', 'claude-3')).toEqual([])
    expect(familyEfforts('chatgpt', 'gpt-4o')).toEqual([])
  })

  it('clamps an unknown stored effort to the preferred default', () => {
    expect(clampEffort('turbo', ['low', 'medium', 'high'])).toBe('medium')
    expect(clampEffort('xhigh', ['minimal', 'low', 'medium', 'high', 'xhigh'])).toBe('xhigh')
    expect(preferredEffort(['low', 'high'])).toBe('high')
  })

  it('labels raw values, title-casing the unknown', () => {
    expect(effortLabel('xhigh')).toBe('X-High')
    expect(effortLabel('max')).toBe('Max')
    expect(effortLabel('ultra')).toBe('Ultra')
    expect(effortLabel('medium')).toBe('Medium')
    expect(effortLabel('turbo')).toBe('Turbo')
  })
})
