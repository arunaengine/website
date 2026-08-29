import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_PROVIDER_KINDS,
  BROWSER_PROVIDER_STORAGE_KEY,
  BrowserProviderValidationError,
  OPENAI_COMPATIBLE_PRESETS,
  createBrowserProviderStore,
  emptyBrowserProviderState,
  loadBrowserProviderState,
  parseBrowserProviderState,
  validateBrowserProvider,
} from './browserProviders'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('browser provider contract', () => {
  it('exposes the two browser-owned provider boundaries', () => {
    expect(BROWSER_PROVIDER_KINDS).toEqual(['anthropic', 'openai_compatible'])
    expect(OPENAI_COMPATIBLE_PRESETS).toEqual([{
      id: 'openai',
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'responses',
      apiKeyRequired: true,
    }])
  })

  it('normalizes fields while preserving the exact compatible API root', () => {
    expect(validateBrowserProvider({
      kind: 'openai_compatible',
      id: ' local ',
      label: ' Local model ',
      model: ' model ',
      baseUrl: 'http://127.0.0.1:11434/v1/',
      protocol: 'chat_completions',
      headers: { Zeta: '2', Alpha: '1' },
    })).toEqual({
      kind: 'openai_compatible',
      id: 'local',
      label: 'Local model',
      model: 'model',
      models: [{ id: 'model' }],
      baseUrl: 'http://127.0.0.1:11434/v1/',
      protocol: 'chat_completions',
      headers: { Alpha: '1', Zeta: '2' },
    })
  })

  it('rejects old provider kinds and does not include secret values in errors', () => {
    expect(() => validateBrowserProvider({
      kind: 'openai',
      id: 'id',
      label: 'label',
      model: 'model',
      apiKey: 'sk-secret',
    })).toThrowError(new BrowserProviderValidationError('provider.kind'))
    expect(() => validateBrowserProvider({
      kind: 'anthropic',
      id: 'id',
      label: 'label',
      model: '',
      apiKey: 'sk-secret',
    })).toThrowError('provider.model')
    try {
      validateBrowserProvider({
        kind: 'anthropic',
        id: 'id',
        label: 'label',
        model: '',
        apiKey: 'sk-secret',
      })
    } catch (error) {
      expect(String(error)).not.toContain('sk-secret')
    }
  })

  it('rejects credentials and roots that are not valid strings', () => {
    expect(() => validateBrowserProvider({
      kind: 'anthropic', id: 'id', label: 'label', model: 'model', apiKey: '',
    })).toThrowError('provider.apiKey')
    expect(() => validateBrowserProvider({
      kind: 'openai_compatible',
      id: 'id', label: 'label', model: 'model', protocol: 'responses', baseUrl: 'not-a-url',
    })).toThrowError('provider.baseUrl')
    expect(() => validateBrowserProvider({
      kind: 'openai_compatible',
      id: 'id', label: 'label', model: 'model', protocol: 'unknown', baseUrl: 'https://example.test/v1',
    })).toThrowError('provider.protocol')
    expect(() => validateBrowserProvider({
      kind: 'openai_compatible',
      id: 'id', label: 'OpenAI', model: 'gpt-5.6', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
    })).toThrowError('provider.apiKey')
  })

  it('rejects custom headers that are not HTTP tokens', () => {
    expect(() => validateBrowserProvider({
      kind: 'openai_compatible',
      id: 'id', label: 'label', model: 'model', protocol: 'chat_completions', baseUrl: 'https://example.test/v1',
      headers: { 'bad header': 'value' },
    })).toThrowError('provider.headers.bad header')
  })

  it('retains fetched model suggestions and adds a manually selected model', () => {
    expect(validateBrowserProvider({
      kind: 'openai_compatible',
      id: 'id', label: 'label', model: 'typed-model', protocol: 'chat_completions', baseUrl: 'https://example.test/v1',
      models: [{ id: 'listed-model', display_name: 'Listed model' }],
    }).models).toEqual([
      { id: 'listed-model', display_name: 'Listed model' },
      { id: 'typed-model' },
    ])
  })
})

describe('browser provider session store', () => {
  it('uses sessionStorage by default and persists an upsert and selection', () => {
    const session = memoryStorage()
    const local = memoryStorage()
    vi.stubGlobal('window', { sessionStorage: session, localStorage: local })
    const store = createBrowserProviderStore()
    store.upsert({ kind: 'anthropic', id: 'a', label: 'Claude', model: 'claude', apiKey: 'sk-a' })
    store.upsert({
      kind: 'openai_compatible',
      id: 'o',
      label: 'Local',
      model: 'local',
      baseUrl: 'http://127.0.0.1:11434/v1',
      protocol: 'chat_completions',
    })
    store.select('o')

    expect(session.getItem(BROWSER_PROVIDER_STORAGE_KEY)).toContain('sk-a')
    expect(local.getItem(BROWSER_PROVIDER_STORAGE_KEY)).toBeNull()
    expect(createBrowserProviderStore(session).state.selectedProviderId).toBe('o')
    expect(createBrowserProviderStore(session).state.providers.map((provider) => provider.id)).toEqual(['a', 'o'])
  })

  it('clears a removed selection and ignores malformed stored state without logging', () => {
    const storage = memoryStorage()
    storage.setItem(BROWSER_PROVIDER_STORAGE_KEY, '{bad json')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(loadBrowserProviderState(storage)).toEqual(emptyBrowserProviderState())
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()

    const store = createBrowserProviderStore(storage)
    store.upsert({ kind: 'anthropic', id: 'a', label: 'Claude', model: 'claude', apiKey: 'key' })
    store.remove('a')
    expect(store.state).toEqual(emptyBrowserProviderState())
  })

  it('validates parsed state deterministically', () => {
    expect(() => parseBrowserProviderState(JSON.stringify({
      version: 1,
      selectedProviderId: 'missing',
      providers: [],
    }))).toThrowError('state.selectedProviderId')
    expect(() => parseBrowserProviderState(JSON.stringify({
      version: 1,
      selectedProviderId: null,
      providers: [
        { kind: 'anthropic', id: 'same', label: 'one', model: 'm', apiKey: 'a' },
        { kind: 'anthropic', id: 'same', label: 'two', model: 'm', apiKey: 'b' },
      ],
    }))).toThrowError('state.providers')
  })
})
