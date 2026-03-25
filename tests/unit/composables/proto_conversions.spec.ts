import { modelsv2Status, v2DataClass, v2PermissionLevel, v2ResourceVariant } from '~/composables/aruna_api_json'
import { formatBytes, toObjectInfo, toSearchResult } from '~/composables/proto_conversions'
import {
  createCollectionResource,
  createDatasetResource,
  createObjectResource,
  createProjectResource,
} from '../../helpers/resource'

describe('composables/proto_conversions', () => {
  it('converts hierarchical resources into object info', () => {
    const info = toObjectInfo(createProjectResource({ id: 'project-1', title: 'Project Title' }), v2PermissionLevel.PERMISSION_LEVEL_ADMIN)

    expect(info).toMatchObject({
      id: 'project-1',
      title: 'Project Title',
      variant: v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
      permission: v2PermissionLevel.PERMISSION_LEVEL_ADMIN,
    })
  })

  it('converts object resources into object info with synthesized stats', () => {
    const info = toObjectInfo(
      createObjectResource({
        id: 'object-1',
        contentLen: '512',
        dataClass: v2DataClass.DATA_CLASS_PRIVATE,
        status: modelsv2Status.STATUS_AVAILABLE,
      }),
      v2PermissionLevel.PERMISSION_LEVEL_READ
    )

    expect(info).toMatchObject({
      id: 'object-1',
      variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      permission: v2PermissionLevel.PERMISSION_LEVEL_READ,
      stats: {
        size: '512',
        count: '1',
        lastUpdated: '',
      },
    })
  })

  it('returns undefined for missing generic resources', () => {
    expect(toObjectInfo(undefined, v2PermissionLevel.PERMISSION_LEVEL_NONE)).toBeUndefined()
  })

  it('converts resources into search result entries', () => {
    const project = toSearchResult(createProjectResource({ id: 'project-2', name: 'proj-name' }))
    const collection = toSearchResult(createCollectionResource({ id: 'collection-2' }))
    const dataset = toSearchResult(createDatasetResource({ id: 'dataset-2' }))
    const object = toSearchResult(createObjectResource({ id: 'object-2', contentLen: '42' }))

    expect(project?.variant).toBe(v2ResourceVariant.RESOURCE_VARIANT_PROJECT)
    expect(collection?.variant).toBe(v2ResourceVariant.RESOURCE_VARIANT_COLLECTION)
    expect(dataset?.variant).toBe(v2ResourceVariant.RESOURCE_VARIANT_DATASET)
    expect(object).toMatchObject({
      variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      stats: {
        size: '42',
        count: '1',
        lastUpdated: '',
      },
    })
  })

  it('formats bytes into readable units', () => {
    expect(formatBytes(0)).toBe('0 Bytes')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536, 2)).toBe('1.5 KB')
  })
})
