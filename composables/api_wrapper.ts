
import type { v2User } from "./aruna_api_json/models/v2User"
import { type v2Project } from "./aruna_api_json/models/v2Project"
import { v2DataClass, type v2CreateProjectRequest, type v2ResourceWithPermission, type v2KeyValue, type v2DeactivateUserResponse, type v2ActivateUserResponse, type v2GetAllUsersResponse, type v2Permission, type v2CreateAPITokenResponse, type v2CreateAPITokenRequest, type v2Endpoint, type modelsv2License } from "./aruna_api_json"

export async function fetchEndpoints(): Promise<v2Endpoint[] | undefined> {
    // Fetch endpoints
    const endpoints = await $fetch('/api/endpoints')
    return endpoints
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

    const response: v2CreateAPITokenResponse = await $fetch<v2CreateAPITokenResponse>('/api/user/tokens', {
        method: 'POST',
        body: request
    })

    return response
}

export async function createUserS3Credentials(endpointId: string): Promise<v2CreateS3CredentialsUserTokenResponse> {
    const response: v2CreateS3CredentialsUserTokenResponse = await $fetch<v2CreateS3CredentialsUserTokenResponse>(`/api/user/s3_credentials/${endpointId}`, {
        method: 'PATCH',
    })

    console.log(response)

    return response
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

export async function createProject(
    name: string,
    description: string,
    keyValues: v2KeyValue[],
    dataClass: v2DataClass,
    metaLicense: string,
    dataLicense: string): Promise<v2Project | undefined> {
    // Create request and send
    const request = {
        name: name,
        description: description,
        keyValues: keyValues,
        relations: [],
        dataClass: dataClass,
        preferredEndpoint: '',
        metadataLicenseTag: '',
        defaultDataLicenseTag: ''
    } as v2CreateProjectRequest

    return $fetch<v2Project>('/api/project', {
        method: 'POST',
        body: request

    })
}