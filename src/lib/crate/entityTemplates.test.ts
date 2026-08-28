import { describe, expect, it } from 'vitest'
import { ENTITY_TEMPLATES, createOtherEntity, propertySuggestionsForType } from './entityTemplates'

describe('ENTITY_TEMPLATES', () => {
  it('emits a typed entity with an id and the declared root role from every template', () => {
    for (const template of ENTITY_TEMPLATES) {
      const entity = template.create({ name: `${template.label} example` })
      expect(entity.id, template.id).toBeTruthy()
      expect(entity.type, template.id).toBeTruthy()
      expect(entity.roles, template.id).toEqual([template.roles[0]])
    }
  })

  it('derives canonical ids for Person, Organization, and Publication templates', () => {
    const person = ENTITY_TEMPLATES.find((template) => template.id === 'person')!
    const organization = ENTITY_TEMPLATES.find((template) => template.id === 'organization')!
    const publication = ENTITY_TEMPLATES.find((template) => template.id === 'publication')!

    expect(person.create({ name: 'Ada Example', orcid: '0000-0002-1825-0097' }).id)
      .toBe('https://orcid.org/0000-0002-1825-0097')
    expect(organization.create({ name: 'Example Lab', ror: 'https://ror.org/03yrm5c26' }).id)
      .toBe('https://ror.org/03yrm5c26')
    expect(publication.create({ name: 'Example paper', doi: '10.1000/example' }).id)
      .toBe('https://doi.org/10.1000/example')
  })

  it('keeps a derived id editable', () => {
    const software = ENTITY_TEMPLATES.find((template) => template.id === 'software')!
    expect(software.create({ id: 'https://example.test/software', name: 'Example tool' }).id)
      .toBe('https://example.test/software')
  })

  it('uses the existing property catalog for Other type suggestions', () => {
    const suggestions = propertySuggestionsForType('http://schema.org/Person')
    expect(suggestions.some((term) => term.name === 'affiliation')).toBe(true)

    const entity = createOtherEntity('http://schema.org/Taxon', { name: 'Example taxon' })
    expect(entity).toMatchObject({
      id: '#entity-example-taxon',
      type: 'Taxon',
      roles: ['about'],
    })
  })
})
