import type {
    v2CustomAttribute,
    v2Permission,
    v2Token,
    v2User
} from "~/composables/aruna_api_json"

import { Buffer } from 'node:buffer'

export function parseJwt(token: any) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}


// Modal magic
export function openModal(modalId: string) {
  let element = document.querySelector(`#${modalId}`) as HTMLElement
  import('preline').then(({HSOverlay}) => {
    HSOverlay.open(element)
  })
}

export function closeModal(modalId: string) {
  let element = document.querySelector(`#${modalId}`) as HTMLElement
  import('preline').then(({HSOverlay}) => {
    HSOverlay.close(element)
  })
}



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
