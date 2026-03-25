import {
  modelsv2Status,
  v2DataClass,
  v2ResourceVariant,
  type v2GenericResource,
} from '~/composables/aruna_api_json'

type ProjectOverrides = Partial<NonNullable<v2GenericResource['project']>>
type CollectionOverrides = Partial<NonNullable<v2GenericResource['collection']>>
type DatasetOverrides = Partial<NonNullable<v2GenericResource['dataset']>>
type ObjectOverrides = Partial<NonNullable<v2GenericResource['object']>>

export function createProjectResource(overrides: ProjectOverrides = {}): v2GenericResource {
  return {
    project: {
      id: 'project-1',
      name: 'project-name',
      title: 'Project Title',
      description: 'Project description',
      keyValues: [],
      stats: {
        size: '2048',
        count: '3',
        lastUpdated: '2024-01-01T00:00:00.000Z',
      },
      dataClass: v2DataClass.DATA_CLASS_PUBLIC,
      createdAt: '2024-01-01T00:00:00.000Z',
      relations: [],
      status: modelsv2Status.STATUS_AVAILABLE,
      authors: [],
      metadataLicenseTag: '',
      defaultDataLicenseTag: '',
      endpoints: [],
      ...overrides,
    },
  }
}

export function createObjectResource(overrides: ObjectOverrides = {}): v2GenericResource {
  return {
    object: {
      id: 'object-1',
      name: 'object-name.txt',
      title: 'Object Title',
      description: 'Object description',
      keyValues: [],
      contentLen: '1024',
      dataClass: v2DataClass.DATA_CLASS_PRIVATE,
      createdAt: '2024-01-01T00:00:00.000Z',
      relations: [],
      status: modelsv2Status.STATUS_AVAILABLE,
      authors: [],
      metadataLicenseTag: '',
      dataLicenseTag: '',
      endpoints: [],
      ...overrides,
    },
  }
}

export function createCollectionResource(overrides: CollectionOverrides = {}): v2GenericResource {
  return {
    collection: {
      id: 'collection-1',
      name: 'collection-name',
      title: 'Collection Title',
      description: 'Collection description',
      keyValues: [],
      stats: {
        size: '1024',
        count: '2',
        lastUpdated: '2024-01-01T00:00:00.000Z',
      },
      dataClass: v2DataClass.DATA_CLASS_PUBLIC,
      createdAt: '2024-01-01T00:00:00.000Z',
      relations: [],
      status: modelsv2Status.STATUS_AVAILABLE,
      authors: [],
      metadataLicenseTag: '',
      defaultDataLicenseTag: '',
      endpoints: [],
      ...overrides,
    },
  }
}

export function createDatasetResource(overrides: DatasetOverrides = {}): v2GenericResource {
  return {
    dataset: {
      id: 'dataset-1',
      name: 'dataset-name',
      title: 'Dataset Title',
      description: 'Dataset description',
      keyValues: [],
      stats: {
        size: '1024',
        count: '2',
        lastUpdated: '2024-01-01T00:00:00.000Z',
      },
      dataClass: v2DataClass.DATA_CLASS_PUBLIC,
      createdAt: '2024-01-01T00:00:00.000Z',
      relations: [],
      status: modelsv2Status.STATUS_AVAILABLE,
      authors: [],
      metadataLicenseTag: '',
      defaultDataLicenseTag: '',
      endpoints: [],
      ...overrides,
    },
  }
}

export { modelsv2Status, v2DataClass, v2ResourceVariant }
