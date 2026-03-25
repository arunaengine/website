import {
  v2InternalRelationVariant,
  v2PermissionLevel,
  type v2Permission,
  v2RelationDirection,
  v2ResourceVariant,
  type v2ResourceWithPermission,
} from '~/composables/aruna_api_json'
import { ArunaError } from '~/composables/ArunaError'
import {
  activateUser,
  createCollection,
  createDataset,
  createObject,
  createProject,
  createUserS3Credentials,
  createUserToken,
  deactivateUser,
  deleteObject,
  deleteUserToken,
  fetchEndpoint,
  fetchEndpoints,
  fetchLicenses,
  fetchResource,
  fetchUser,
  fetchUsers,
  fetchUserResources,
  getAnnouncements,
  getAnnouncement,
  getDownloadUrl,
  getObjectBucketAndKey,
  getPublicResourceUrl,
  getResourceHierarchy,
  getUserS3Credentials,
  getUploadUrl,
  searchResources,
} from '~/composables/api_wrapper'
import { mockFetch } from '../../helpers/nuxt'
import {
  createCollectionResource,
  createDatasetResource,
  createObjectResource,
  createProjectResource,
} from '../../helpers/resource'
import { createUser } from '../../helpers/user'
import { describe, expect, it } from "vitest"

describe('composables/api_wrapper', () => {
  it('posts search queries and returns the response', async () => {
    const response = { resources: [] }
    mockFetch.mockResolvedValueOnce(response)

    await expect(searchResources('genomics')).resolves.toEqual(response)
    expect(mockFetch).toHaveBeenCalledWith('api/search', {
      method: 'POST',
      body: 'genomics',
    })
  })

  it('maps search failures to a stable error message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('backend unavailable'))

    await expect(searchResources('genomics')).rejects.toThrow('Resource search failed.')
  })

  it('returns the resource payload for successful resource fetches', async () => {
    const resource = { id: 'resource-1' } as v2ResourceWithPermission
    mockFetch.mockResolvedValueOnce({ resource })

    await expect(fetchResource('resource-1')).resolves.toEqual(resource)
    expect(mockFetch).toHaveBeenCalledWith('/api/resource', {
      method: 'GET',
      query: {
        resourceId: 'resource-1',
      },
    })
  })

  it('returns undefined for 404 resource fetches', async () => {
    mockFetch.mockRejectedValueOnce(new Error('404 Not Found'))

    await expect(fetchResource('missing')).resolves.toBeUndefined()
  })

  it('throws a stable error for non-404 resource fetch failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500 Internal Server Error'))

    await expect(fetchResource('resource-1')).rejects.toThrow('Failed to fetch resource')
  })

  it('returns an empty list when no user is provided', async () => {
    await expect(fetchUserResources(undefined)).resolves.toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches resources for project permissions only', async () => {
    const permission = { projectId: 'project-1' } as v2Permission
    const user = createUser({
      attributes: {
        personalPermissions: [permission, {} as v2Permission],
      },
    })
    const resources = [{ id: 'project-1' }]
    mockFetch.mockResolvedValueOnce(resources)

    await expect(fetchUserResources(user)).resolves.toEqual(resources)
    expect(mockFetch).toHaveBeenCalledWith('/api/resources', {
      query: {
        resourceIds: ['project-1'],
      },
    })
  })

  it('returns an empty list when a user has no project permissions', async () => {
    const user = createUser({
      attributes: {
        personalPermissions: [{} as v2Permission],
      },
    })

    await expect(fetchUserResources(user)).resolves.toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns announcements and falls back to an empty list on failure', async () => {
    const announcements = [{ id: 'a-1' }]
    mockFetch.mockResolvedValueOnce({ announcements })
    mockFetch.mockRejectedValueOnce(new Error('network'))

    await expect(getAnnouncements('cursor', 5)).resolves.toEqual(announcements)
    await expect(getAnnouncements(undefined, undefined)).resolves.toEqual([])
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/announcements', {
      query: {
        'page.startAfter': 'cursor',
        'page.pageSize': 5,
      },
    })
  })

  it('uses default announcement pagination values when no cursor or limit is provided', async () => {
    mockFetch.mockResolvedValueOnce({ announcements: [] })

    await expect(getAnnouncements(undefined, undefined)).resolves.toEqual([])
    expect(mockFetch).toHaveBeenCalledWith('/api/announcements', {
      query: {
        'page.startAfter': '',
        'page.pageSize': -1,
      },
    })
  })

  it('returns announcement details and falls back to undefined on failure', async () => {
    const announcement = { id: 'announcement-1' }
    mockFetch.mockResolvedValueOnce(announcement)
    mockFetch.mockRejectedValueOnce(new Error('missing'))

    await expect(getAnnouncement('announcement-1')).resolves.toEqual(announcement)
    await expect(getAnnouncement('announcement-2')).resolves.toBeUndefined()
  })

  it('returns endpoints and falls back to an empty list on failure', async () => {
    const endpoints = [{ id: 'endpoint-1' }]
    mockFetch.mockResolvedValueOnce(endpoints)
    mockFetch.mockRejectedValueOnce(new Error('network'))

    await expect(fetchEndpoints()).resolves.toEqual(endpoints)
    await expect(fetchEndpoints()).resolves.toEqual([])
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/endpoints')
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/endpoints')
  })

  it('returns a single endpoint and maps failures to a stable error message', async () => {
    const endpoint = { id: 'endpoint-1' }
    mockFetch.mockResolvedValueOnce(endpoint)
    mockFetch.mockRejectedValueOnce(new Error('network'))

    await expect(fetchEndpoint('endpoint-1')).resolves.toEqual(endpoint)
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/endpoint', {
      method: 'GET',
      query: {
        endpointId: 'endpoint-1',
      },
    })

    await expect(fetchEndpoint('endpoint-1')).rejects.toThrow('Failed to fetch endpoint')
  })

  it('returns licenses without remapping', async () => {
    const licenses = [{ tag: 'MIT' }]
    mockFetch.mockResolvedValueOnce(licenses)

    await expect(fetchLicenses()).resolves.toEqual(licenses)
    expect(mockFetch).toHaveBeenCalledWith('/api/licenses')
  })

  it('lets license fetch failures bubble to the caller', async () => {
    mockFetch.mockRejectedValueOnce(new Error('license failure'))

    await expect(fetchLicenses()).rejects.toThrow('license failure')
  })

  it('passes userId queries through fetchUser and omits them when absent', async () => {
    const user = { id: 'user-1' }
    const error = new ArunaError(404, 'Missing user')
    mockFetch.mockResolvedValueOnce(user)
    mockFetch.mockResolvedValueOnce(error)

    await expect(fetchUser('user-1')).resolves.toEqual(user)
    await expect(fetchUser(undefined)).resolves.toEqual(error)
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/user', {
      method: 'GET',
      query: { userId: 'user-1' },
    })
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/user', {
      method: 'GET',
      query: {},
    })
  })

  it('returns users and maps activation toggles to booleans', async () => {
    mockFetch.mockResolvedValueOnce([{ id: 'user-1' }])
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockFetch.mockResolvedValueOnce({ ok: true })

    await expect(fetchUsers()).resolves.toEqual([{ id: 'user-1' }])
    await expect(activateUser('user-1')).resolves.toBe(true)
    await expect(deactivateUser('user-1')).resolves.toBe(true)
  })

  it('returns false for activation toggles when the backend resolves undefined', async () => {
    mockFetch.mockResolvedValueOnce(undefined)
    mockFetch.mockResolvedValueOnce(undefined)

    await expect(activateUser('user-1')).resolves.toBe(false)
    await expect(deactivateUser('user-1')).resolves.toBe(false)
  })

  it('creates user tokens and deletes them', async () => {
    const permission = { projectId: 'project-1' } as v2Permission
    const tokenResponse = { token: { id: 'token-1' } }
    const deleteResponse = { deleted: true }
    mockFetch.mockResolvedValueOnce(tokenResponse)
    mockFetch.mockResolvedValueOnce(deleteResponse)

    await expect(createUserToken('token-name', permission, '2025-01-01T00:00:00.000Z')).resolves.toEqual(tokenResponse)
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/user/tokens', {
      method: 'POST',
      body: {
        name: 'token-name',
        permission,
        expiresAt: '2025-01-01T00:00:00.000Z',
      },
    })

    await expect(deleteUserToken('token-1')).resolves.toEqual(deleteResponse)
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/user/token', {
      method: 'DELETE',
      query: {
        tokenId: 'token-1',
      },
    })
  })

  it('passes optional token scope and expiry through unchanged', async () => {
    mockFetch.mockResolvedValueOnce({ token: { id: 'token-2' } })

    await createUserToken('token-name', undefined, undefined)
    expect(mockFetch).toHaveBeenCalledWith('/api/user/tokens', {
      method: 'POST',
      body: {
        name: 'token-name',
        permission: undefined,
        expiresAt: undefined,
      },
    })
  })

  it('requires an endpoint id for creating S3 credentials', async () => {
    await expect(createUserS3Credentials(undefined)).rejects.toThrow('No endpoint id provided to fetch credentials')
  })

  it('creates and fetches S3 credentials for a specific endpoint', async () => {
    const createResponse = { accessKey: 'access' }
    const getResponse = { accessKey: 'access', secretKey: 'secret' }
    mockFetch.mockResolvedValueOnce(createResponse)
    mockFetch.mockResolvedValueOnce(getResponse)

    await expect(createUserS3Credentials('endpoint-1')).resolves.toEqual(createResponse)
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/user/s3_credentials/endpoint-1', {
      method: 'PATCH',
    })

    await expect(getUserS3Credentials('endpoint-1')).resolves.toEqual(getResponse)
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/user/s3_credentials/endpoint-1', {
      method: 'GET',
    })
  })

  it('maps S3 credential creation failures to a stable error message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('request failed'))

    await expect(createUserS3Credentials('endpoint-1')).rejects.toThrow(
      'Failed to create S3 credentials. Please try again later.'
    )
  })

  it('requires an endpoint id for fetching S3 credentials', async () => {
    await expect(getUserS3Credentials(undefined)).rejects.toThrow('No endpoint id provided to fetch credentials')
  })

  it('maps S3 credential fetch failures to a stable error message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('request failed'))

    await expect(getUserS3Credentials('endpoint-1')).rejects.toThrow(
      'Failed to fetch S3 credentials. Please try again later.'
    )
  })
  it('creates projects, collections, and datasets from nested response payloads', async () => {
    const project = { id: 'project-1' }
    const collection = { id: 'collection-1' }
    const dataset = { id: 'dataset-1' }
    mockFetch.mockResolvedValueOnce({ project })
    mockFetch.mockResolvedValueOnce({ collection })
    mockFetch.mockResolvedValueOnce({ dataset })

    await expect(createProject({ name: 'project' })).resolves.toEqual(project)
    await expect(createCollection({ name: 'collection' })).resolves.toEqual(collection)
    await expect(createDataset({ name: 'dataset' })).resolves.toEqual(dataset)
  })

  it('maps create failures to stable error messages', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    mockFetch.mockRejectedValueOnce(new Error('fail'))

    await expect(createProject({ name: 'project' })).rejects.toThrow('Project creation failed.')
    await expect(createCollection({ name: 'collection' })).rejects.toThrow('Collection creation failed.')
    await expect(createDataset({ name: 'dataset' })).rejects.toThrow('Dataset creation failed.')
  })

  it('returns created objects and maps missing object payloads to a stable error', async () => {
    const object = { id: 'object-1' }
    mockFetch.mockResolvedValueOnce({ object })
    mockFetch.mockResolvedValueOnce({ object: undefined })

    await expect(createObject({ name: 'file.txt' })).resolves.toEqual(object)
    await expect(createObject({ name: 'file.txt' })).rejects.toThrow('Object creation failed: Error: Object in response was undefined.')
  })

  it('maps object creation fetch failures to a stable error including the original reason', async () => {
    mockFetch.mockRejectedValueOnce(new Error('backend fail'))

    await expect(createObject({ name: 'file.txt' })).rejects.toThrow('Object creation failed: Error: backend fail')
  })

  it('deletes objects and maps failures to a stable error message', async () => {
    mockFetch.mockResolvedValueOnce({ deleted: true })
    mockFetch.mockRejectedValueOnce(new Error('fail'))

    await expect(deleteObject('object-1', true)).resolves.toBe(true)
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/object', {
      method: 'DELETE',
      query: {
        objectId: 'object-1',
      },
      body: {
        withRevisions: true,
      },
    })

    await expect(deleteObject('object-1', false)).rejects.toThrow('Object deletion failed.')
  })

  it('returns upload and download urls and maps failures to stable messages', async () => {
    const upload = { url: 'https://upload.example/object-1' }
    const download = { url: 'https://bucket.example.com/path/to/file.txt' }
    mockFetch.mockResolvedValueOnce(upload)
    mockFetch.mockResolvedValueOnce(download)
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    mockFetch.mockRejectedValueOnce(new Error('fail'))

    await expect(getUploadUrl('object-1')).resolves.toEqual(upload)
    await expect(getDownloadUrl('object-1')).resolves.toEqual(download)
    await expect(getUploadUrl('object-1')).rejects.toThrow('Failed to fetch resource upload url. Please try again later')
    await expect(getDownloadUrl('object-1')).rejects.toThrow('Failed to fetch resource download url. Please try again later.')
  })

  it('returns resource hierarchies and maps failures to a stable error', async () => {
    const hierarchy = { root: 'project-1' }
    mockFetch.mockResolvedValueOnce(hierarchy)
    mockFetch.mockRejectedValueOnce(new Error('fail'))

    await expect(getResourceHierarchy('resource-1')).resolves.toEqual(hierarchy)
    await expect(getResourceHierarchy('resource-1')).rejects.toThrow('Failed to fetch resource hierarchy. Please try again later.')
  })

  it('extracts bucket and key from download urls', async () => {
    mockFetch.mockResolvedValueOnce({ url: 'https://bucket.storage.example.org/path/to/file.txt' })

    await expect(getObjectBucketAndKey('object-1')).resolves.toEqual(['bucket', 'path/to/file.txt'])
  })

  it('requires a resource id and validates missing download urls', async () => {
    await expect(getObjectBucketAndKey(undefined)).rejects.toThrow('No resource id provided')

    mockFetch.mockResolvedValueOnce({ url: undefined })

    await expect(getObjectBucketAndKey('object-1')).rejects.toThrow('Download url in response was undefined')
  })

  it('builds public urls for non-object resources without traversal', async () => {
    const project = createProjectResource({
      id: 'project-1',
      name: 'project-name',
    }).project!

    await expect(
      getPublicResourceUrl('endpoint.example.org', {
        id: project.id!,
        name: project.name!,
        title: project.title!,
        variant: v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
        description: project.description!,
        authors: project.authors!,
        key_values: project.keyValues!,
        stats: project.stats!,
        data_class: project.dataClass!,
        created_at: project.createdAt!,
        relations: project.relations!,
        object_status: project.status!,
        permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
        license: '',
        data_license: '',
        endpoints: [],
      }, true)
    ).resolves.toBe('https://objects.endpoint.example.org/project-1/project-name.tar.gz')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('traverses parent relations to build public object urls', async () => {
    const objectInfo = {
      id: 'object-1',
      name: 'object.txt',
      title: 'Object Title',
      variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      description: 'Object description',
      authors: [],
      key_values: [],
      stats: { size: '1', count: '1', lastUpdated: '' },
      data_class: createObjectResource().object!.dataClass!,
      created_at: '2024-01-01T00:00:00.000Z',
      relations: [
        {
          internal: {
            resourceId: 'dataset-1',
            direction: v2RelationDirection.RELATION_DIRECTION_INBOUND,
            definedVariant: v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO,
          },
        },
      ],
      object_status: createObjectResource().object!.status!,
      permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
      license: '',
      data_license: '',
      endpoints: [],
    }

    mockFetch
      .mockResolvedValueOnce({
        resource: {
          resource: createDatasetResource({
            name: 'dataset-name',
            relations: [
              {
                internal: {
                  resourceId: 'collection-1',
                  direction: v2RelationDirection.RELATION_DIRECTION_INBOUND,
                  definedVariant: v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO,
                },
              },
            ],
          }),
          permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
        },
      })
      .mockResolvedValueOnce({
        resource: {
          resource: createCollectionResource({
            name: 'collection-name',
            relations: [
              {
                internal: {
                  resourceId: 'project-1',
                  direction: v2RelationDirection.RELATION_DIRECTION_INBOUND,
                  definedVariant: v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO,
                },
              },
            ],
          }),
          permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
        },
      })
      .mockResolvedValueOnce({
        resource: {
          resource: createProjectResource({
            name: 'project-name',
            relations: [],
          }),
          permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
        },
      })

    await expect(getPublicResourceUrl('endpoint.example.org', objectInfo, false)).resolves.toBe(
      'http://project-name.endpoint.example.org/collection-name/dataset-name/object.txt'
    )
  })

  it('fails when a resource lacks parent relations during public object url traversal', async () => {
    const objectInfo = {
      id: 'object-1',
      name: 'object.txt',
      title: 'Object Title',
      variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      description: 'Object description',
      authors: [],
      key_values: [],
      stats: { size: '1', count: '1', lastUpdated: '' },
      data_class: createObjectResource().object!.dataClass!,
      created_at: '2024-01-01T00:00:00.000Z',
      relations: [],
      object_status: createObjectResource().object!.status!,
      permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
      license: '',
      data_license: '',
      endpoints: [],
    }

    await expect(getPublicResourceUrl('endpoint.example.org', objectInfo, false)).rejects.toThrow(
      'Resource (object-1:object.txt) has no parent relations'
    )
  })

  it('fails when a traversed parent resource does not exist', async () => {
    const objectInfo = {
      id: 'object-1',
      name: 'object.txt',
      title: 'Object Title',
      variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      description: 'Object description',
      authors: [],
      key_values: [],
      stats: { size: '1', count: '1', lastUpdated: '' },
      data_class: createObjectResource().object!.dataClass!,
      created_at: '2024-01-01T00:00:00.000Z',
      relations: [
        {
          internal: {
            resourceId: 'dataset-1',
            direction: v2RelationDirection.RELATION_DIRECTION_INBOUND,
            definedVariant: v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO,
          },
        },
      ],
      object_status: createObjectResource().object!.status!,
      permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
      license: '',
      data_license: '',
      endpoints: [],
    }

    mockFetch.mockRejectedValueOnce(new Error('404 Not Found'))

    await expect(getPublicResourceUrl('endpoint.example.org', objectInfo, false)).rejects.toThrow(
      'Parent resource (dataset-1) does not exist'
    )
  })
})
