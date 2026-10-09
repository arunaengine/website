// Realms this browser has checked, kept per realm id with the newest descriptor. A starred
// realm is saved and listed in the picker; the others only give names to known realm ids.
// A stored descriptor is identity data, not proof that the realm is reachable now.
import { computed, ref } from 'vue'
import { fetchWithTimeout } from '@/lib/fetch'
import { verifyDescriptor, type RealmDescriptor, type Signed, type VerifiedRealm } from './descriptor'

const STORAGE_KEY = 'aruna.federation.realms'
const REGISTRY_TIMEOUT_MS = 10_000

export interface KnownRealm extends VerifiedRealm {
  saved: boolean
}

export type RememberResult = 'stored' | 'older'

function readStore(): Record<string, KnownRealm> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, KnownRealm>) : {}
  } catch {
    return {}
  }
}

const store = ref<Record<string, KnownRealm>>(readStore())

function writeStore(next: Record<string, KnownRealm>) {
  store.value = next
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The in-memory list still works for this tab.
  }
}

export const knownRealms = computed(() => Object.values(store.value))
export const savedRealms = computed(() =>
  knownRealms.value.filter((realm) => realm.saved).sort((a, b) => a.name.localeCompare(b.name)),
)

export function knownRealm(realmId: string): KnownRealm | undefined {
  return store.value[realmId]
}

/**
 * Keeps a checked descriptor. An older one than the stored descriptor is refused and the
 * stored one stays; `save` stars the realm, and an unstarred realm keeps its star.
 */
export function rememberRealm(realm: VerifiedRealm, options: { save?: boolean } = {}): RememberResult {
  const current = store.value[realm.realmId]
  if (current && current.issuedAt > realm.issuedAt) {
    if (options.save && !current.saved) writeStore({ ...store.value, [realm.realmId]: { ...current, saved: true } })
    return 'older'
  }
  const saved = Boolean(options.save || current?.saved)
  writeStore({ ...store.value, [realm.realmId]: { ...realm, saved } })
  return 'stored'
}

export function setRealmSaved(realmId: string, saved: boolean) {
  const current = store.value[realmId]
  if (!current || current.saved === saved) return
  writeStore({ ...store.value, [realmId]: { ...current, saved } })
}

/** Reloads the store, for another tab's change or a test. */
export function reloadRealms() {
  store.value = readStore()
}

export interface RealmKpis {
  live_datasets: number | null
  groups: number | null
  nodes_configured: number | null
}

interface RegistryEntry {
  realm_id: string
  registration: {
    payload: { descriptor: Signed<RealmDescriptor>; kpis: RealmKpis; observed_at: number }
  }
  received_at: number
  verified: boolean
  stale: boolean
}

export interface RegistryRealm {
  realm: VerifiedRealm
  kpis: RealmKpis
  observedAt: number
  verified: boolean
  stale: boolean
}

/**
 * The registry's realms whose descriptors verify here. The registry signature over the
 * counts is not checked: counts are self-reported and only shown.
 */
export async function listRegistry(registryUrl: string, signal?: AbortSignal): Promise<RegistryRealm[]> {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
  const response = await fetchWithTimeout(
    new URL('v1/realms', base),
    { headers: { Accept: 'application/json' }, signal },
    REGISTRY_TIMEOUT_MS,
  )
  if (!response.ok) throw new Error(`The registry answered ${response.status}.`)
  const entries = (await response.json()) as RegistryEntry[]
  if (!Array.isArray(entries)) throw new Error('The registry answer is malformed.')
  const listed = await Promise.all(
    entries.map(async (entry): Promise<RegistryRealm | null> => {
      try {
        const payload = entry.registration.payload
        const realm = await verifyDescriptor(payload.descriptor)
        if (realm.realmId !== entry.realm_id) return null
        return {
          realm,
          kpis: payload.kpis,
          observedAt: payload.observed_at,
          verified: entry.verified === true,
          stale: entry.stale === true,
        }
      } catch {
        return null
      }
    }),
  )
  return listed.filter((entry): entry is RegistryRealm => entry !== null)
}

/** Realms whose name, description or id contains the query, without case. */
export function matchesQuery(realm: VerifiedRealm, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [realm.name, realm.description, realm.realmId, realm.portalUrl].some((value) =>
    value.toLowerCase().includes(needle),
  )
}
