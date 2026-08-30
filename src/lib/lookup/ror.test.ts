import { afterEach, describe, expect, it, vi } from 'vitest'
import affiliationFixture from './__fixtures__/rorAffiliation.json'
import { matchRorByName, rorAffiliationHit } from './ror'

afterEach(() => {
  vi.unstubAllGlobals()
})

// The affiliation endpoint without the chosen flag, as an older payload has it.
function unmarked(name: string) {
  return { items: [{ organization: { id: 'https://ror.org/03yrm5c26', names: [{ value: name, types: ['ror_display'] }] } }] }
}

describe('ROR affiliation matching', () => {
  it('takes the item the registry chose', () => {
    const hit = rorAffiliationHit('Example Institute', affiliationFixture)

    expect(hit).toMatchObject({
      id: 'https://ror.org/03yrm5c26',
      label: 'Example Institute',
      entity: { properties: { url: 'https://example.test', addressCountry: 'Germany' } },
    })
  })

  it('refuses a payload where nothing was chosen', () => {
    const items = affiliationFixture.items.map((item) => ({ ...item, chosen: false }))

    expect(rorAffiliationHit('Example Institute', { items })).toBeNull()
    expect(rorAffiliationHit('Example Institute', { items: [] })).toBeNull()
    expect(rorAffiliationHit('Example Institute', {})).toBeNull()
  })

  it('falls back to a top hit that is the query itself', () => {
    expect(rorAffiliationHit('  example   institute ', unmarked('Example Institute'))?.id)
      .toBe('https://ror.org/03yrm5c26')
    expect(rorAffiliationHit('Example Institute', unmarked('Example Institute of Physics'))).toBeNull()
  })

  it('asks the affiliation endpoint and answers null for an empty name', async () => {
    const fetchMock = vi.fn(async (url: unknown) => ({ ok: true, url, json: async () => affiliationFixture }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await matchRorByName('  ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await matchRorByName('Example Institute'))?.id).toBe('https://ror.org/03yrm5c26')
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.ror.org/v2/organizations?affiliation=Example+Institute',
    )
  })

  it('reports an unhappy registry as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))

    await expect(matchRorByName('Example Institute')).rejects.toThrow('503')
  })
})
