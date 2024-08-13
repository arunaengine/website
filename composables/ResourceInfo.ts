import type {
  modelsv2License,
  v2Author,
  v2Collection,
  v2Dataset,
  v2GenericResource,
  v2KeyValue,
  v2Object,
  v2Project,
  v2Relation,
  v2Stats
} from "~/composables/aruna_api_json"
import {modelsv2Status, v2DataClass, v2PermissionLevel, v2ResourceVariant} from "~/composables/aruna_api_json"
import type {EndpointInfo} from "~/composables/proto_conversions"

export class ResourceInfo {
  public id: string
  public name: string
  public title: string
  public variant: v2ResourceVariant
  public description: string
  public authors: v2Author[]
  public keyValues: v2KeyValue[]
  public stats: v2Stats
  public dataClass: v2DataClass
  public createdAt: string
  public relations: v2Relation[]
  public objectStatus: modelsv2Status
  public permission: v2PermissionLevel
  public metaLicense: modelsv2License
  public dataLicense: modelsv2License
  public endpoints: EndpointInfo[]

  constructor(id: string,
              name: string,
              title: string,
              variant: v2ResourceVariant,
              description: string,
              authors: v2Author[],
              keyValues: v2KeyValue[],
              stats: v2Stats,
              dataClass: v2DataClass,
              createdAt: string,
              relations: v2Relation[],
              objectStatus: modelsv2Status,
              permission: v2PermissionLevel,
              metaLicense: modelsv2License,
              dataLicense: modelsv2License,
              endpoints: EndpointInfo[]) {
    this.id = id;
    this.name = name;
    this.title = title;
    this.variant = variant;
    this.description = description;
    this.authors = authors;
    this.keyValues = keyValues;
    this.stats = stats;
    this.dataClass = dataClass;
    this.createdAt = createdAt;
    this.relations = relations;
    this.objectStatus = objectStatus;
    this.permission = permission;
    this.metaLicense = metaLicense;
    this.dataLicense = dataLicense;
    this.endpoints = endpoints;
  }

  static fromHierarchicalResource(resource: v2Project | v2Collection | v2Dataset,
                                  resourceType: v2ResourceVariant): ResourceInfo {
    return new ResourceInfo(
        resource.id || '',
        resource.name || '',
        resource.title || '',
        resourceType,
        resource.description || '',
        resource.authors || [],
        resource.keyValues || [],
        resource.stats || {size: '0', count: '0', lastUpdated: resource.createdAt || ''},
        resource.dataClass || v2DataClass.DATA_CLASS_UNSPECIFIED,
        resource.createdAt || '',
        resource.relations || [],
        resource.status || modelsv2Status.STATUS_UNSPECIFIED,
        v2PermissionLevel.PERMISSION_LEVEL_UNSPECIFIED,
        {tag: resource.metadataLicenseTag, name: '', text: '', url: ''},
        {tag: resource.defaultDataLicenseTag, name: '', text: '', url: ''},
        resource.endpoints || []
    )
  }

  static fromObject(object: v2Object): ResourceInfo {
    return new ResourceInfo(
        object.id || '',
        object.name || '',
        object.title || '',
        v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
        object.description || '',
        object.authors || [],
        object.keyValues || [],
        {size: object.contentLen, count: '1', lastUpdated: object.createdAt || ''},
        object.dataClass || v2DataClass.DATA_CLASS_UNSPECIFIED,
        object.createdAt || '',
        object.relations || [],
        object.status || modelsv2Status.STATUS_UNSPECIFIED,
        v2PermissionLevel.PERMISSION_LEVEL_UNSPECIFIED,
        {tag: object.metadataLicenseTag, name: '', text: '', url: ''},
        {tag: object.dataLicenseTag, name: '', text: '', url: ''},
        object.endpoints || []
    )
  }

  static fromParts(resource: v2GenericResource,
                   permission: v2PermissionLevel,
                   metaLicense?: modelsv2License,
                   dataLicense?: modelsv2License): ResourceInfo {
    let resourceInfo = undefined
    if (resource.project) {
      resourceInfo = ResourceInfo.fromHierarchicalResource(resource.project, v2ResourceVariant.RESOURCE_VARIANT_PROJECT)
    } else if (resource.collection) {
      resourceInfo = ResourceInfo.fromHierarchicalResource(resource.collection, v2ResourceVariant.RESOURCE_VARIANT_COLLECTION)
    } else if (resource.dataset) {
      resourceInfo = ResourceInfo.fromHierarchicalResource(resource.dataset, v2ResourceVariant.RESOURCE_VARIANT_DATASET)
    } else if (resource.object) {
      resourceInfo = ResourceInfo.fromObject(resource.object)
    }

    if (resourceInfo) {
      resourceInfo.permission = permission
      resourceInfo.metaLicense = metaLicense ? metaLicense : resourceInfo.metaLicense
      resourceInfo.dataLicense = dataLicense ? dataLicense : resourceInfo.dataLicense
      return resourceInfo
    }

    throw new ArunaError(418, 'Strange.')
  }

  toJsonLd(): Object {
    return resourceInfoToJsonLd(this)
  }
}

export function resourceInfoToJsonLd(resource: ResourceInfo): Object {
  const host = useRuntimeConfig().public.websiteHost // window.location.origin ?
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `https://w3id.org/aruna/${resource.id}`,
    'http://purl.org/dc/terms/conformsTo': {
      "@type": "CreativeWork",
      "@id": "https://bioschemas.org/profiles/Dataset/1.0-RELEASE"
    },
    identifier: `${host}/objects/${resource.id}`,
    name: resource.name,
    alternateName: resource.title,
    description: resource.description,
    dateCreated: resource.createdAt,
    license: {
      '@type': 'CreativeWork',
      name: resource.metaLicense.name,
      url: resource.metaLicense.url,
      description: 'License under which the dataset metadata can be distributed.'
    },
    about: resource.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT ? extractAboutFromKeyValues(resource.keyValues, resource.dataLicense) : undefined,
    url: `${host}/objects/${resource.id}`,
    creator: authorsToJsonLd(resource.authors)
  }
}

export function extractAboutFromKeyValues(keyValues: v2KeyValue[], dataLicense: modelsv2License): Object | undefined {
  let about = {
    license: {
      '@type': 'CreativeWork',
      name: dataLicense.name,
      url: dataLicense.url,
      description: 'License under which the dataset data can be distributed.'
    },
    'http://purl.org/dc/terms/conformsTo': undefined,
  }

  for (const kv of keyValues) {
    if (kv.key === 'http://purl.org/dc/terms/conformsTo') {
      about["http://purl.org/dc/terms/conformsTo"] = kv.value ? JSON.parse(kv.value) : undefined
      break
    }
  }

  return about
}

export function authorsToJsonLd(authors: v2Author[]): Object | undefined {
  if (authors.length <= 0)
    return undefined

  let jsonLdAuthors = []
  for (const author of authors) {
    jsonLdAuthors.push({
      '@type': 'Person',
      identifier: `https://orcid.org/${author.orcid}`,
      familyName: author.lastName,
      givenName: author.firstName,
      email: author.email
    })
  }

  return jsonLdAuthors
}