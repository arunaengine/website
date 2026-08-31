import { describe, expect, it } from 'vitest'
import { parseInline } from './inline'

describe('docs inline links', () => {
  it('passes plain text', () => {
    expect(parseInline('A dataset is data plus metadata.')).toEqual([
      { text: 'A dataset is data plus metadata.' },
    ])
  })

  it('keeps bare brackets', () => {
    // Bracketed text without a (target) is not a link.
    expect(parseInline('use [brackets] freely')).toEqual([{ text: 'use [brackets] freely' }])
  })

  it('links known concepts', () => {
    expect(parseInline('see [Profiles](concept:profiles-conformance) here')).toEqual([
      { text: 'see ' },
      { label: 'Profiles', to: { name: 'docs', params: { topic: 'profiles-conformance' } } },
      { text: ' here' },
    ])
  })

  it('links section anchors', () => {
    // A valid anchor becomes a hash; a stale one degrades to the topic link.
    expect(parseInline('[markers](concept:data-and-deletion#delete-markers-are-recoverable-history)')).toEqual([
      {
        label: 'markers',
        to: {
          name: 'docs',
          params: { topic: 'data-and-deletion' },
          hash: '#delete-markers-are-recoverable-history',
        },
      },
    ])
    expect(parseInline('[markers](concept:data-and-deletion#no-such-section)')).toEqual([
      { label: 'markers', to: { name: 'docs', params: { topic: 'data-and-deletion' } } },
    ])
  })

  it('links glossary terms', () => {
    expect(parseInline('a [role](concept:glossary#role)')).toEqual([
      { text: 'a ' },
      { label: 'role', to: { name: 'docs', params: { topic: 'glossary' }, hash: '#role' } },
    ])
  })

  it('links the api reference', () => {
    // api:reference is the only api: target; anything else stays text.
    expect(parseInline('[REST API](api:reference)')).toEqual([
      { label: 'REST API', to: { name: 'api-reference' } },
    ])
    expect(parseInline('[REST API](api:swagger)')).toEqual([{ text: 'REST API' }])
  })

  it('links known pages', () => {
    expect(parseInline('[Settings](page:settings)')).toEqual([
      { label: 'Settings', to: { name: 'settings' } },
    ])
  })

  it('links https urls', () => {
    expect(parseInline('the [RO-Crate](https://www.researchobject.org/ro-crate/) site')).toEqual([
      { text: 'the ' },
      { label: 'RO-Crate', href: 'https://www.researchobject.org/ro-crate/' },
      { text: ' site' },
    ])
  })

  it('drops unknown targets', () => {
    // Unknown topics, unknown routes, and non-https schemes degrade to text.
    expect(parseInline('go to [nowhere](concept:missing), [x](page:nope), or [y](mailto:foo)')).toEqual([
      { text: 'go to nowhere, x, or y' },
    ])
  })
})
