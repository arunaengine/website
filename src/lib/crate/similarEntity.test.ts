import { describe, expect, it } from 'vitest'
import { addEntity, findSimilarEntity, newDraft, setProperty, type CrateDraft } from './editor'

function withOrg(name: string, id?: string): CrateDraft {
  return addEntity(newDraft(), { type: 'Organization', name, ...(id ? { id } : {}) }).draft
}

describe('findSimilarEntity', () => {
  it('matches a name apart from case and spacing', () => {
    const draft = withOrg('Example  Institute')

    expect(findSimilarEntity(draft, 'Organization', ' example institute ')?.id).toBe('#example-institute')
    expect(findSimilarEntity(draft, 'Organization', 'Example Institute of Physics')).toBeUndefined()
    expect(findSimilarEntity(draft, 'Organization', '   ')).toBeUndefined()
  })

  it('ignores an entity of another type', () => {
    const draft = addEntity(newDraft(), { type: 'Person', name: 'Example Institute' }).draft

    expect(findSimilarEntity(draft, 'Organization', 'Example Institute')).toBeUndefined()
    expect(findSimilarEntity(draft, 'http://schema.org/Person', 'Example Institute')?.types).toEqual(['Person'])
  })

  it('matches the same ror.org id under another name', () => {
    // The identifier carries the ROR while the @id stays the local one.
    const draft = setProperty(withOrg('Institut Example'), '#institut-example', 'identifier', [
      { kind: 'url', value: 'https://ror.org/03yrm5c26' },
    ])

    expect(findSimilarEntity(draft, 'Organization', 'https://ror.org/03yrm5c26')?.id).toBe('#institut-example')
    expect(findSimilarEntity(draft, 'Organization', 'https://ror.org/02nv7yv05')).toBeUndefined()
    expect(findSimilarEntity(withOrg('Named', 'https://ror.org/03yrm5c26'), 'Organization', '03yrm5c26')?.id)
      .toBe('https://ror.org/03yrm5c26')
  })

  it('answers with the first match in draft order', () => {
    // The root is no exception here; the dialog is what refuses to reuse it.
    const named = setProperty(newDraft(), './', 'name', [{ kind: 'text', value: 'Twin' }])
    const draft = addEntity(named, { type: 'Dataset', name: 'Twin', id: '#twin' }).draft

    expect(findSimilarEntity(draft, 'Dataset', 'Twin')?.id).toBe('./')
  })
})
