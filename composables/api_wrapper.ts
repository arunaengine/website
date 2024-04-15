import {
    type modelsv2License,
    type v2Author,
    type v2Collection,
    type v2CreateAPITokenRequest,
    type v2CreateAPITokenResponse,
    type v2CreateCollectionRequest,
    type v2CreateDatasetRequest,
    type v2CreateObjectRequest,
    type v2CreateProjectRequest,
    type v2CreateS3CredentialsUserTokenResponse,
    v2DataClass,
    type v2Dataset,
    type v2Endpoint,
    type v2GetDownloadURLResponse,
    type v2GetHierarchyResponse,
    type v2GetS3CredentialsUserTokenResponse,
    type v2GetUploadURLResponse,
    v2InternalRelationVariant,
    type v2KeyValue,
    type v2Object,
    type v2Permission,
    type v2Project,
    type v2Relation,
    v2RelationDirection,
    v2ResourceVariant,
    type v2ResourceWithPermission,
    type v2SearchResourcesResponse,
    type v2User
} from "./aruna_api_json"
import {type ObjectInfo, toObjectInfo} from "~/composables/proto_conversions";
import obj from "svgo/lib/svgo/css-select-adapter";

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
    const endpoints = await $fetch('/api/endpoints')
    return endpoints
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
    const licenses = await $fetch<modelsv2License[]>('/api/licenses')
    return licenses
}

export async function fetchUser(id: string | undefined): Promise<v2User | string> {
    const user = await $fetch(id ? `/api/user?userId=${id}` : '/api/user').catch((e) => {
        return e.toString()
    })
    return user
}

export async function fetchUsers(): Promise<v2User[] | undefined> {
    const users = await $fetch('/api/users')
    return users
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

export async function createUserToken(name: string, scope: v2Permission | undefined, expiry: string | undefined): Promise<v2CreateAPITokenResponse | undefined> {
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

export async function createUserS3Credentials(endpointId: string): Promise<v2CreateS3CredentialsUserTokenResponse> {
    return await $fetch<v2CreateS3CredentialsUserTokenResponse>(`/api/user/s3_credentials/${endpointId}`, {
        method: 'PATCH',
    }).catch(error => {
        throw Error("Failed to create S3 credentials. Please try again later.")
    })
}

export async function getUserS3Credentials(endpointId: string): Promise<v2GetS3CredentialsUserTokenResponse> {
    return await $fetch<v2GetS3CredentialsUserTokenResponse>(`/api/user/s3_credentials/${endpointId}`, {
        method: 'GET',
    }).catch(error => {
        throw Error("Failed to fetch S3 credentials. Please try again later.")
    })
}

export async function fetchResource(resourceId: string): Promise<v2ResourceWithPermission> {
    return $fetch<v2ResourceWithPermission>('/api/resource', {
        method: 'GET',
        query: {
            resourceId: resourceId
        }
    }).catch(error => {
        console.error(error)
        throw new Error("Resource fetch failed.")
    })
}

export async function fetchUserResources(user: v2User | undefined): Promise<v2ResourceWithPermission[]> {
    if (user === undefined) {
        return []
    }

    // Filter projects from user permissions
    const projectPermissions = user.attributes?.personalPermissions?.filter((perm) => perm.projectId)
    // Fetch resources
    if (projectPermissions && projectPermissions.length > 0) {
        let fetchUrl = '/api/resources?'
        projectPermissions.forEach((perm, idx, arr) => {
            if (perm.projectId) {
                fetchUrl += arr.length - 1 === idx ? `resourceIds=${perm.projectId}` : `resourceIds=${perm.projectId}&`
            }
        })

        const resources = await $fetch<v2ResourceWithPermission[]>(fetchUrl)
        return resources
    }

    return []
}

export async function createProject(request: v2CreateProjectRequest): Promise<v2Project | undefined> {
    return $fetch<v2Project>('/api/project', {
        method: 'POST',
        body: request
    }).catch(error => {
        console.error(error)
        throw new Error("Project creation failed.")
    })
}

export async function createCollection(request: v2CreateCollectionRequest): Promise<v2Collection | undefined> {
    return $fetch<v2Project>('/api/collection', {
        method: 'POST',
        body: request
    }).catch(error => {
        console.error(error)
        throw new Error("Collection creation failed.")
    })
}

export async function createDataset(request: v2CreateDatasetRequest): Promise<v2Dataset | undefined> {
    return $fetch<v2Project>('/api/dataset', {
        method: 'POST',
        body: request
    }).catch(error => {
        console.error(error)
        throw new Error("Dataset creation failed.")
    })
}

export async function createObject(
    name: string,
    title: string,
    authors: v2Author[],
    description: string,
    keyValues: v2KeyValue[],
    relations: v2Relation[],
    dataClass: v2DataClass,
    parentType: v2ResourceVariant,
    parentId: string,
    metaLicense: string,
    dataLicense: string): Promise<v2Object | undefined>
{
    // Create request and send
    const request = {
        name: name,
        title: title,
        description: description,
        keyValues: keyValues,
        relations: relations,
        dataClass: dataClass,
        projectId: parentType === v2ResourceVariant.RESOURCE_VARIANT_PROJECT ? parentId : undefined,
        collectionId: parentType === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION ? parentId : undefined,
        datasetId: parentType === v2ResourceVariant.RESOURCE_VARIANT_DATASET ? parentId : undefined,
        hashes: [],
        metadataLicenseTag: metaLicense,
        dataLicenseTag: dataLicense,
        authors: []
    } as v2CreateObjectRequest

    return $fetch<v2Object>('/api/object', {
        method: 'POST',
        body: request
    }).catch(error => {
        console.error(error)
        throw new Error("Object creation failed.")
    })
}

export async function getUploadUrl(resourceId: string) {
    return $fetch<v2GetUploadURLResponse>(`/api/object/${resourceId}/upload`, {
        method: 'GET'
    }).catch(error => {
        console.error(error)
        throw Error("Failed to fetch resource upload url. Please try again later.")
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

export async function getPublicResourceUrl(endpointHost: string, resource: ObjectInfo): Promise<string> {
    // Return obvious case
    if (resource.variant === v2ResourceVariant.RESOURCE_VARIANT_PROJECT) {
        return `https://${resource.name}`
    }

    // The damn rest
    let key = resource.name
    while (resource.variant !== v2ResourceVariant.RESOURCE_VARIANT_PROJECT) {
        const parentRel = resource.relations.find(rel =>
            rel.internal?.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND &&
            rel.internal?.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO
        )

        if (parentRel?.internal?.resourceId) {
            const parentObj = await fetchResource(parentRel.internal.resourceId)
            const objectInfo = toObjectInfo(parentObj.resource, parentObj.permission)
            if (objectInfo) {
                if (objectInfo.variant !== v2ResourceVariant.RESOURCE_VARIANT_PROJECT) {
                    key += `/${objectInfo.name}`
                }
                resource = objectInfo
            } else {
                throw Error("Conversion to ObjectOInfo failed")
            }
        } else {
            throw Error(`Resource (${resource.id} has no parent relations ...`)
        }
    }

    return `http://${resource.name}.${endpointHost}/${key}`
}