import { ArunaError } from '~/composables/ArunaError'
import { ResourceInfo, authorsToJsonLd, extractAboutFromKeyValues, resourceInfoToJsonLd } from '~/composables/ResourceInfo'
import { modelsv2Status, v2DataClass, v2PermissionLevel, v2ResourceVariant } from '~/composables/aruna_api_json'
import {
  createObjectResource,
  createProjectResource,
} from '../../helpers/resource'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {
      websiteHost: 'https://app.example.org',
    },
  }),
}))

vi.mock('#app/nuxt', () => ({
  useRuntimeConfig: () => ({
    public: {
      websiteHost: 'https://app.example.org',
    },
  }),
}))

describe('composables/ResourceInfo', () => {
  it('creates resource info from hierarchical resources', () => {
    const resourceInfo = ResourceInfo.fromHierarchicalResource(
      createProjectResource({ id: 'project-1', title: 'Project Title' }).project!,
      v2ResourceVariant.RESOURCE_VARIANT_PROJECT
    )

    expect(resourceInfo.id).toBe('project-1')
    expect(resourceInfo.variant).toBe(v2ResourceVariant.RESOURCE_VARIANT_PROJECT)
    expect(resourceInfo.metaLicense.tag).toBe('')
  })

  it('creates resource info from objects with normalized stats', () => {
    const resourceInfo = ResourceInfo.fromObject(
      createObjectResource({ id: 'object-1', contentLen: '256', createdAt: '2024-01-01T00:00:00.000Z' }).object!
    )

    expect(resourceInfo.variant).toBe(v2ResourceVariant.RESOURCE_VARIANT_OBJECT)
    expect(resourceInfo.stats).toEqual({
      size: '256',
      count: '1',
      lastUpdated: '2024-01-01T00:00:00.000Z',
    })
  })

  it('creates resource info from generic resources and applies provided licenses and permission', () => {
    const resourceInfo = ResourceInfo.fromParts(
      createProjectResource({ id: 'project-2', metadataLicenseTag: 'MIT', defaultDataLicenseTag: 'CC-BY' }),
      v2PermissionLevel.PERMISSION_LEVEL_ADMIN,
      { tag: 'MIT', name: 'MIT', text: '', url: 'https://mit.example.org' },
      { tag: 'CC-BY', name: 'CC BY', text: '', url: 'https://cc.example.org' }
    )

    expect(resourceInfo.permission).toBe(v2PermissionLevel.PERMISSION_LEVEL_ADMIN)
    expect(resourceInfo.metaLicense.name).toBe('MIT')
    expect(resourceInfo.dataLicense.name).toBe('CC BY')
  })

  it('throws an ArunaError when no resource variant is set', () => {
    expect(() =>
      ResourceInfo.fromParts({}, v2PermissionLevel.PERMISSION_LEVEL_NONE)
    ).toThrow(ArunaError)
  })

  it('builds json-ld for object resources including about and authors', () => {
    const resourceInfo = new ResourceInfo(
      'object-1',
      'object-name',
      'Object Title',
      v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      'Object description',
      [{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.org', orcid: '0000-0002-1825-0097' }],
      [{ key: 'http://purl.org/dc/terms/conformsTo', value: '{"@id":"https://schema.example.org"}' }],
      { size: '10', count: '1', lastUpdated: '2024-01-01T00:00:00.000Z' },
      v2DataClass.DATA_CLASS_PUBLIC,
      '2024-01-01T00:00:00.000Z',
      [],
      modelsv2Status.STATUS_AVAILABLE,
      v2PermissionLevel.PERMISSION_LEVEL_READ,
      { tag: 'MIT', name: 'MIT', text: '', url: 'https://mit.example.org' },
      { tag: 'CC-BY', name: 'CC BY', text: '', url: 'https://cc.example.org' },
      []
    )

    const jsonLd = resourceInfoToJsonLd(resourceInfo) as Record<string, any>

    expect(jsonLd.identifier).toBe('https://app.example.org/objects/object-1')
    expect(jsonLd.about.license.name).toBe('CC BY')
    expect(jsonLd.creator).toEqual([
      expect.objectContaining({
        identifier: 'https://orcid.org/0000-0002-1825-0097',
        familyName: 'Lovelace',
      }),
    ])
  })

  it('extracts about metadata and authors independently', () => {
    expect(
      extractAboutFromKeyValues(
        [{ key: 'http://purl.org/dc/terms/conformsTo', value: '{"@id":"https://schema.example.org"}' }],
        { tag: 'CC-BY', name: 'CC BY', text: '', url: 'https://cc.example.org' }
      )
    ).toEqual({
      license: {
        '@type': 'CreativeWork',
        name: 'CC BY',
        url: 'https://cc.example.org',
        description: 'License under which the dataset data can be distributed.',
      },
      'http://purl.org/dc/terms/conformsTo': {
        '@id': 'https://schema.example.org',
      },
    })

    expect(authorsToJsonLd([])).toBeUndefined()
    expect(authorsToJsonLd([{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.org', orcid: '0000' }])).toEqual([
      {
        '@type': 'Person',
        identifier: 'https://orcid.org/0000',
        familyName: 'Lovelace',
        givenName: 'Ada',
        email: 'ada@example.org',
      },
    ])
  })
})
