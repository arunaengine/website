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

export function prettyDisplayJson(value: string | undefined): string {
  if (value) {
    try {
      return `<pre>${JSON.stringify(JSON.parse(value), null, 2)}</pre>`
    } catch (error) {
      return value
    }
  }

  return ''
}

export function debounce(fn: Function, timeout: number) {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, timeout);
  };
}

// Some datetime related helper functions //
// -------------------------------------- //
export function formatDate(dateStr: string | undefined) {
  const locale = (navigator && navigator.language) || "de-DE";
  let date = dateStr ? new Date(dateStr) : new Date(0);
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function displayDate(createdAt: string | undefined, modifiedAt: string | undefined) {
  const c_date = createdAt ? new Date(createdAt) : new Date(0)
  const m_date = modifiedAt ? new Date(modifiedAt) : new Date(0)
  const locale = (navigator && navigator.language) || "de-DE";

  if (m_date > c_date) {
    const date_str = m_date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    return `${date_str} (modified)`
  } else {
    return c_date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }
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
