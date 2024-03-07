
import type { v2User } from "./aruna_api_json/models/v2User"
import { v2DataClass, type v2CreateProjectRequest, type v2ResourceWithPermission, type v2KeyValue, type v2DeactivateUserResponse, type v2ActivateUserResponse, type v2GetAllUsersResponse } from "./aruna_api_json"

export async function fetchUser(): Promise<v2User | undefined> {
    const oidc = useOidc()
    if (oidc.isLoggedIn) {
        // Check if token needs refresh
        await $fetch('/oidc/user')
        // Fetch user
        const user = await $fetch('/api/user')
        return user
    }

    return undefined
}

export async function fetchUsers(): Promise<v2User[] | undefined> {
    const oidc = useOidc()
    if (oidc.isLoggedIn) {
        // Check if token needs refresh
        await $fetch('/oidc/user')
        // Fetch user
        const users = await $fetch('/api/users')
        return users
    }

    return undefined
}

export async function deactivateUser(userId: string): Promise<boolean> {
    const oidc = useOidc()
    if (oidc.isLoggedIn) {
        // Check if token needs refresh
        await $fetch('/oidc/user')
        // Deactivate user
        const response = await $fetch(`/api/user/${userId}/deactivate`, {
            method: 'PATCH'
        })
        return true
    }

    return false
}

export async function activateUser(userId: string): Promise<boolean> {
    const oidc = useOidc()
    if (oidc.isLoggedIn) {
        // Check if token needs refresh
        await $fetch('/oidc/user')
        // Activate user
        const response = await $fetch(`/api/user/${userId}/activate`, {
            method: 'PATCH'
        })
        return true
    }

    return false
}

export async function fetchUserResources(user: v2User): Promise<v2ResourceWithPermission[]> {
    const oidc = useOidc()
    if (oidc.isLoggedIn) {
        // Filter projects from user permissions
        const projectPermissions = user.attributes?.personalPermissions?.filter((perm) => perm.projectId)
        // Check if token needs refresh
        await $fetch('/oidc/user')
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
    }

    return []
}

export async function createProject(name: string, description: string, keyValues: v2KeyValue[], dataClass: v2DataClass) {
    const oidc = useOidc()
    if (oidc.isLoggedIn) {
        // Check if token needs refresh
        await $fetch('/oidc/user')
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
}