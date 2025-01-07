import {
  type apistorageservicesv2DeleteObjectResponse,
  type modelsv2License,
  type v2Announcement,
  type v2Collection,
  type v2CreateAPITokenRequest,
  type v2CreateAPITokenResponse,
  type v2CreateCollectionRequest,
  type v2CreateCollectionResponse,
  type v2CreateDatasetRequest,
  type v2CreateDatasetResponse,
  type v2CreateObjectRequest,
  type v2CreateObjectResponse,
  type v2CreateProjectRequest,
  type v2CreateProjectResponse,
  type v2CreateS3CredentialsUserTokenResponse,
  type v2Dataset,
  type v2DeleteAPITokenResponse,
  type v2Endpoint,
  type v2GetAnnouncementsResponse,
  type v2GetDownloadURLResponse,
  type v2GetHierarchyResponse,
  type v2GetResourceResponse,
  type v2GetS3CredentialsUserTokenResponse,
  type v2GetUploadURLResponse,
  v2InternalRelationVariant,
  type v2Object,
  type v2Permission,
  type v2Project,
  v2RelationDirection,
  v2ResourceVariant,
  type v2ResourceWithPermission,
  type v2SearchResourcesResponse,
  type v2User
} from "./aruna_api_json"
import {type ObjectInfo, type EndpointInfo, toObjectInfo} from "~/composables/proto_conversions";
import type {ArunaError} from "~/composables/ArunaError";

/* ----- V3 ----- */
import type {paths, components} from "~/types/aruna-v3"
import {type GetGroupsFromUserResponseGroups} from "~/types/aruna-v3-enums";

// ----- Requests -----
export type RegisterUserRequest = paths["/api/v3/users"]["post"]["requestBody"]["content"]["application/json"];
export type CreateComponentRequest = paths["/api/v3/global/components"]["post"]["requestBody"]["content"]["application/json"];
export type CreateGroupRequest = paths["/api/v3/groups"]["post"]["requestBody"]["content"]["application/json"];
export type CreateRealmRequest = paths["/api/v3/realms"]["post"]["requestBody"]["content"]["application/json"];
export type CreateTokenRequest = paths["/api/v3/users/tokens"]["post"]["requestBody"]["content"]["application/json"];
export type CreateResourceRequest = paths["/api/v3/resources"]["post"]["requestBody"]["content"]["application/json"];
export type CreateS3CredentialsRequest = paths["/api/v3/users/s3credentials"]["post"]["requestBody"]["content"]["application/json"];


// ----- Responses -----
// Global
export type CreateComponentResponse = paths["/api/v3/global/components"]["post"]["responses"][200]["content"]["application/json"];

// Groups
export type CreateGroupResponse = paths["/api/v3/groups"]["post"]["responses"][200]["content"]["application/json"];

// Info
export type GetEventsResponse = paths["/api/v3/info/events"]["get"]["responses"][200]["content"]["application/json"];
export type GetStatsResponse = paths["/api/v3/info/stats"]["get"]["responses"][200]["content"]["application/json"];
export type SearchResponse = paths["/api/v3/info/search"]["get"]["responses"][200]["content"]["application/json"];

// Realms
export type CreateRealmResponse = paths["/api/v3/realms"]["post"]["responses"][200]["content"]["application/json"];
export type GetRealmComponentsResponse = paths["/api/v3/realms/{id}/components"]["get"]["responses"][200]["content"]["application/json"];
export type AddComponentToRealmResponse = paths["/api/v3/realms/{id}/components/{component_id}"]["patch"]["responses"][200]["content"]["application/json"];

// Resources
export type CreateProjectResponse = paths["/api/v3/resources/projects"]["post"]["responses"][200]["content"]["application/json"];
export type CreateResourceResponse = paths["/api/v3/resources"]["post"]["responses"][200]["content"]["application/json"];
export type GetResourcesResponse = paths["/api/v3/resources"]["get"]["responses"][200]["content"]["application/json"];
export type GetRelationsResponse = paths["/api/v3/resources/{id}/relations"]["get"]["responses"][200]["content"]["application/json"];
export type DeleteResourcesResponse = paths["/api/v3/resources/{id}"]["delete"]["responses"][200]["content"]["application/json"];

// Users
export type RegisterUserResponse = paths["/api/v3/users"]["post"]["responses"][200]["content"]["application/json"];
export type GetUserResponse = paths["/api/v3/users"]["get"]["responses"][200]["content"]["application/json"];
export type CreateTokenResponse = paths["/api/v3/users/tokens"]["post"]["responses"][200]["content"]["application/json"];
export type GetRealmsFromUserResponse = paths["/api/v3/users/realms"]["get"]["responses"][200]["content"]["application/json"];
export type GetGroupsFromUserResponse = paths["/api/v3/users/groups"]["get"]["responses"][200]["content"]["application/json"];
export type GetTokensFromUserResponse = paths["/api/v3/users/tokens"]["get"]["responses"][200]["content"]["application/json"];
export type CreateS3CredentialsResponse = paths["/api/v3/users/s3credentials"]["post"]["responses"][200]["content"]["application/json"];
export type GetS3CredentialsFromUserResponse = paths["/api/v3/users/s3credentials"]["get"]["responses"][200]["content"]["application/json"];

// ----- Models -----
// v3
export type v3Component = components["schemas"]["Component"]
export type Endpoint = components["schemas"]["Endpoint"]
export type Author = components["schemas"]["Author"]
export type Group = components["schemas"]["Group"]
export type KeyValue = components["schemas"]["KeyValue"]
export type Realm = components["schemas"]["Realm"]
export type Resource = components["schemas"]["Resource"]
export type Token = components["schemas"]["Token"]
export type User = components["schemas"]["User"]
export type License = components["schemas"]["License"]
export type S3Credential = components["schemas"]["S3Credential"]

// Custom
export type ResourceElement = Resource & {
  children: ResourceElement[]
}

export type GroupInfo = {
  group: Group,
  permission: GetGroupsFromUserResponseGroups
}

export type SimpleCredentials = {
  access_key: string
  secret_key: string
}

// ----- Events -----
export enum EventTypes {
  RegisterUser = 'RegisterUserRequestTx',
  CreateToken = 'CreateTokenRequestTx',
  CreateRealm = 'CreateRealmRequestTx',
  CreateGroup = 'CreateGroupRequestTx',
  CreateComponent = 'CreateComponentRequestTx',
  CreateResource = 'CreateResourceRequestTx',
  TODO = 'Complete this enum'
}

export type Oidc = {
  oidc_realm: string
  oidc_subject: string
}

export type TxUser = {
  user_id: string
  auth_method: {
    oidc?: Oidc
  } | {
    Aruna: number
  }
  impersonated_by: TxUser | null
}

export type BaseTx = {
  id: string
  event_id: string
  type: EventTypes,
  requester: {
    Unregistered?: Oidc
    User?: TxUser
  }
}

export type RegisterUserTx = BaseTx & {
  req: {
    first_name: string,
    last_name: string,
    email: string,
    identifier: string
  }
}

export type CreateTokenTx = BaseTx & {
  req: {
    name: string,
    scope: 'Personal' | 'Resource',
    expires_at: Date,
    group_id: string | null,
    realm_id: string | null
  }
}

export type CreateGroupTx = BaseTx & {
  req: {
    name: string,
    description: string,
  }
  generated_group: {
    id: string
    name: string
    description: string
  }
}

export type CreateRealmTx = BaseTx & {
  req: {
    tag: string,
    name: string,
    description: string,
  }
  generated_group: {
    id: string
    name: string
    description: string
  }
}


// ----- Combined convenience
export async function fetchChildren(resource_id: string): Promise<ResourceElement[]> {
  const children_ids = await $fetch<GetRelationsResponse>(`/api/v3/relations`, {
    query: {
      node: resource_id,
      direction: 'Outgoing',
      offset: 0,
      page_size: Number.MAX_SAFE_INTEGER
    }
  }).then(response => {
    return response.relations.filter(rel => rel.relation_type === 'HasPart').map(rel => rel.to_id)
  })

  if (children_ids.length <= 0) {
    console.info('[fetchChildren] Resource ${resource_id} has no children')
    return []
  }

  return await $fetch<GetResourcesResponse>('/api/v3/resources', {
    query: {
      ids: children_ids
    }
  }).then(response => {
    let resources: ResourceElement[] = []
    for (const resource of response.resources) {
      let extended = resource as any // lol, cast to any to allow dynamic adding of properties
      extended.children = []
      resources.push(extended as ResourceElement)
    }
    return resources
  })
}

/* ----- END V3 ----- */

export async function getAnnouncements(start_after: string | undefined, limit: number | undefined): Promise<v2Announcement[]> {
  return await $fetch<v2GetAnnouncementsResponse>('/api/announcements', {
    query: {
      'page.startAfter': start_after || '',
      'page.pageSize': limit && limit > 0 ? limit : -1
    }
  })
      .then(response => {
        return response.announcements ? response.announcements : []
      })
      .catch(error => {
        console.error(error)
        return []
      })
}

export async function getAnnouncement(announcementId: string): Promise<v2Announcement | undefined> {
  return await $fetch<v2Announcement | undefined>('/api/announcement', {
    query: {
      announcementId: announcementId
    },
  }).catch(error => {
    console.error(error)
    return undefined
  })
}

export async function searchResources(query: string): Promise<v2SearchResourcesResponse> {
  return await $fetch<v2SearchResourcesResponse>('api/search', {
    method: 'POST',
    body: query
  }).catch(error => {
    console.error(error)
    throw new Error("Resource search failed.")
  })
}

export async function fetchEndpoints(): Promise<v2Endpoint[] | undefined> {
  // Fetch endpoints
  return await $fetch('/api/endpoints').catch(error => {
    console.error(error)
    return []
  })
}

export async function fetchEndpoint(endpointId: string): Promise<v2Endpoint | undefined> {
  // Fetch endpoints
  return await $fetch<v2Endpoint>('/api/endpoint', {
    method: 'GET',
    query: {
      endpointId: endpointId
    }
  }).catch(error => {
    console.error(error)
    throw Error("Failed to fetch endpoint")
  })
}

export async function fetchLicenses(): Promise<modelsv2License[] | undefined> {
  // Fetch licenses
  return await $fetch<modelsv2License[]>('/api/licenses')
}

export async function fetchUser(userId: string | undefined): Promise<v2User | ArunaError> {
  return await $fetch<v2User | ArunaError>('/api/user', {
    method: 'GET',
    query: userId ? {
      userId: userId
    } : {}
  })
}

export async function fetchUsers(): Promise<v2User[] | undefined> {
  return await $fetch<v2User[] | undefined>('/api/users')
}

export async function activateUser(userId: string): Promise<boolean> {
  const response = await $fetch(`/api/user/${userId}/activate`, {
    method: 'PATCH'
  })
  return response !== undefined
}

export async function deactivateUser(userId: string): Promise<boolean> {
  // Deactivate user
  const response = await $fetch(`/api/user/${userId}/deactivate`, {
    method: 'PATCH'
  })
  return response !== undefined
}

export async function createUserToken(
    name: string,
    scope: v2Permission | undefined,
    expiry: string | undefined): Promise<v2CreateAPITokenResponse | undefined> {
  // Create request and send
  const request = {
    name: name,
    permission: scope,
    expiresAt: expiry
  } as v2CreateAPITokenRequest

  return await $fetch<v2CreateAPITokenResponse>('/api/user/tokens', {
    method: 'POST',
    body: request
  })
}

export async function deleteUserToken(token_id: string) {
  return await $fetch<v2DeleteAPITokenResponse>('/api/user/token', {
    method: 'DELETE',
    query: {
      tokenId: token_id
    }
  })
}


export async function createUserS3Credentials(endpointId: string | undefined): Promise<v2CreateS3CredentialsUserTokenResponse> {
  if (endpointId === undefined)
    throw Error('No endpoint id provided to fetch credentials')

  return await $fetch<v2CreateS3CredentialsUserTokenResponse>(`/api/user/s3_credentials/${endpointId}`, {
    method: 'PATCH',
  }).catch(error => {
    throw Error("Failed to create S3 credentials. Please try again later.")
  })
}

export async function getUserS3Credentials(endpointId: string | undefined): Promise<v2GetS3CredentialsUserTokenResponse> {
  if (endpointId === undefined)
    throw Error('No endpoint id provided to fetch credentials')

  return await $fetch<v2GetS3CredentialsUserTokenResponse>(`/api/user/s3_credentials/${endpointId}`, {
    method: 'GET',
  }).catch(error => {
    throw Error("Failed to fetch S3 credentials. Please try again later.")
  })
}

export async function fetchResource(resourceId: string): Promise<v2ResourceWithPermission | undefined> {
  return $fetch<v2GetResourceResponse>('/api/resource', {
    method: 'GET',
    query: {
      resourceId: resourceId
    }
  }).then(response => {
    return response.resource
  }).catch(error => {
    if (error.message.includes('404')) {
      return undefined // Not found
    }
    // Bubble every other error up
    throw new Error("Failed to fetch resource")
  })
}

export async function fetchUserResources(user: v2User | undefined): Promise<v2ResourceWithPermission[]> {
  if (user === undefined) {
    return []
  }

  // Filter projects from user permissions
  const projectPermissions = user.attributes?.personalPermissions?.filter((perm) => perm.projectId)
  let projectIds: string[] = [];
  // Fetch resources
  if (projectPermissions && projectPermissions.length > 0) {
    let fetchUrl = '/api/resources'
    projectPermissions.forEach((perm, idx, arr) => {
      if (perm.projectId) projectIds.push(perm.projectId)
    })

    return await $fetch<v2ResourceWithPermission[]>(fetchUrl, {
      query: {
        resourceIds: projectIds
      }
    })
  }

  return []
}

export async function createProject(request: v2CreateProjectRequest): Promise<v2Project | undefined> {
  return $fetch<v2CreateProjectResponse>('/api/project', {
    method: 'POST',
    body: request
  }).then(response => {
    return response.project
  }).catch(error => {
    console.error(error)
    throw new Error("Project creation failed.")
  })
}

export async function createCollection(request: v2CreateCollectionRequest): Promise<v2Collection | undefined> {
  return $fetch<v2CreateCollectionResponse>('/api/collection', {
    method: 'POST',
    body: request
  }).then(response => {
    return response.collection
  }).catch(error => {
    console.error(error)
    throw new Error("Collection creation failed.")
  })
}

export async function createDataset(request: v2CreateDatasetRequest): Promise<v2Dataset | undefined> {
  return $fetch<v2CreateDatasetResponse>('/api/dataset', {
    method: 'POST',
    body: request
  }).then(response => {
    return response.dataset
  }).catch(error => {
    console.error(error)
    throw new Error("Dataset creation failed.")
  })
}

export async function createObject(request: v2CreateObjectRequest): Promise<v2Object> {
  return $fetch<v2CreateObjectResponse>('/api/object', {
    method: 'POST',
    body: request
  }).then(response => {
    if (response.object)
      return response.object

    throw Error('Object in response was undefined.')
  }).catch(error => {
    console.error(error)
    throw new Error(`Object creation failed: ${error.toString()}`)
  })
}

export async function deleteObject(objectId: string, withRevisions: boolean): Promise<boolean> {
  return $fetch<apistorageservicesv2DeleteObjectResponse>('/api/object', {
    method: 'DELETE',
    query: {
      objectId: objectId
    },
    body: {
      withRevisions: withRevisions
    }
  }).then(response => {
    return typeof response !== 'undefined'
  }).catch(error => {
    console.error(error)
    throw new Error("Object deletion failed.")
  })
}

export async function getUploadUrl(resourceId: string) {
  return $fetch<v2GetUploadURLResponse | ArunaError>(`/api/object/${resourceId}/upload`, {
    method: 'GET'
  }).catch(error => {
    throw Error('Failed to fetch resource upload url. Please try again later')
  })
}

export async function getDownloadUrl(resourceId: string) {
  return $fetch<v2GetDownloadURLResponse>(`/api/object/${resourceId}/download`, {
    method: 'GET'
  }).catch(error => {
    console.error(error)
    throw Error("Failed to fetch resource download url. Please try again later.")
  })
}

export async function getResourceHierarchy(resourceId: string) {
  return $fetch<v2GetHierarchyResponse>(`/api/relation/${resourceId}/hierarchy`, {
    method: 'GET'
  }).catch(error => {
    console.error(error)
    throw Error("Failed to fetch resource hierarchy. Please try again later.")
  })
}

export async function getObjectBucketAndKey(resourceId: string | undefined): Promise<string[]> {
  if (resourceId === undefined)
    throw Error('No resource id provided')

  return await getDownloadUrl(resourceId)
      .then(response => {
        if (response.url) {
          const url = new URL(response.url)
          return [url.host.split('.')[0], url.pathname.substring(1)]
        }
        throw new Error('Download url in response was undefined')
      })
}

export async function getPublicResourceUrl(
    endpointHost: string,
    resource: ObjectInfo, ssl: boolean
): Promise<string> {
  // Hierarchy objects are downloaded through the special Objects bucket
  if (resource.variant !== v2ResourceVariant.RESOURCE_VARIANT_OBJECT) {
    return 'http' + (ssl ? 's' : '') + `://objects.${endpointHost}/${resource.id}/${resource.name}.tar.gz`
  }

  // Else traverse hierarchy up
  let project = undefined
  let collection = undefined
  let dataset = undefined
  let object = resource.name

  while (resource.variant !== v2ResourceVariant.RESOURCE_VARIANT_PROJECT) {
    const parentRel = resource.relations.find(rel =>
        rel.internal?.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND &&
        rel.internal?.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO
    )

    if (parentRel?.internal?.resourceId) {
      const parentObj = await fetchResource(parentRel.internal.resourceId)
      if (parentObj) {
        const objectInfo = toObjectInfo(parentObj.resource, parentObj.permission)
        if (objectInfo) {
          switch (objectInfo.variant) {
            case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
              project = objectInfo.name
              break
            }
            case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: {
              collection = objectInfo.name
              break
            }
            case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
              dataset = objectInfo.name
              break
            }
          }
          resource = objectInfo
        } else {
          throw Error("Conversion to ObjectInfo failed")
        }
      } else {
        throw Error(`Parent resource (${parentRel.internal.resourceId}) does not exist`)
      }
    } else {
      throw Error(`Resource (${resource.id}:${resource.name}) has no parent relations`)
    }
  }

  // Build url from its parts
  const schema = ssl ? 'https' : 'http'
  let url = `${schema}://${project}.${endpointHost}`
  url += collection ? `/${collection}` : ''
  url += dataset ? `/${dataset}` : ''
  url += `/${object}`

  return url
}