import type { v2CustomAttribute } from "./aruna_api_json/models/v2CustomAttribute";
import type { v2Permission } from "./aruna_api_json/models/v2Permission";
import type { v2Token } from "./aruna_api_json/models/v2Token";
import type { v2User } from "./aruna_api_json/models/v2User";

/* ---------- USER ---------- */
export function isUserAdmin(user: v2User | undefined): boolean {
    if (user?.attributes?.globalAdmin) {
        return user.attributes.globalAdmin
    }
    return false
}

export function isUserServiceAccount(user: v2User | undefined): boolean {
    if (user?.attributes?.serviceAccount) {
        return user.attributes.serviceAccount
    }
    return false
}

export function getUserCustomAttributes(user: v2User | undefined): v2CustomAttribute[] {
    if (user?.attributes?.customAttributes) {
        return user.attributes.customAttributes
    }
    return []
}

export function getUserEndpoints(user: v2User | undefined): string[] {
    if (user?.attributes?.trustedEndpoints) {
        return user.attributes.trustedEndpoints
    }
    return []
}

export function getUserToken(user: v2User | undefined): v2Token[] {
    if (user?.attributes?.tokens) {
        return user.attributes.tokens
    }
    return []
}

export function getUserPermissions(user: v2User | undefined): v2Permission[] {
    if (user?.attributes?.personalPermissions) {
        return user.attributes.personalPermissions
    }
    return []
}

export function getUserResources() {}
/* -------------------- */


/* ---------- RESOURCE ---------- */
export function createS3Key(collection: string | undefined, dataset: string | undefined, object: string): string {
    let key = collection ? `${collection}/` : ''
    key = dataset ? `${key}${dataset}/` : ''
    return `${key}${object}`
}
/* ------------------------------ */
