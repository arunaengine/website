
import type { v2User } from "./aruna_api_json/models/v2User"
import { v2DataClass, type v2CreateProjectRequest, type v2ResourceWithPermission, type v2KeyValue, type v2DeactivateUserResponse, type v2ActivateUserResponse, type v2GetAllUsersResponse, type v2Permission, type v2CreateAPITokenResponse, type v2CreateAPITokenRequest } from "./aruna_api_json"

export async function fetchUser(id: string | undefined): Promise<v2User | string> {
    const user = await $fetch(id ? `/api/user?userId=${id}` : '/api/user').catch((e) => {
        return e.toString()
    })
    return user
}

export async function fetchUsers(): Promise<v2User[] | undefined> {
    const users = await $fetch('/api/users')
    console.log(users)
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
    return response !== undefined}

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

export async function createProject(name: string, description: string, keyValues: v2KeyValue[], dataClass: v2DataClass) {
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

    await $fetch('/api/project', {
        method: 'POST',
        body: request
    })
}