// Last-known catalog snapshot so a page reload on a device that cannot reach
// its serving node still shows a browsable (stale) catalog (aruna#273).
// NOT needed when the portal is served by the local node — reads work live
// there; this covers only the reload-while-disconnected case. Full crates
// are deliberately not cached (unbounded size); list items carry
// rocrate_summary, which is enough for cards and titles.
import type { MetadataDocumentListItem } from './api'

const KEY = 'aruna.catalogCache.v1'
// localStorage quota guard; a serialized snapshot beyond this is skipped.
const MAX_CHARS = 2_000_000

export interface CatalogCacheSnapshot {
  savedAt: number // unix ms
  metadataItems: MetadataDocumentListItem[]
  profileItems: MetadataDocumentListItem[]
}

export function saveCatalogCache(snapshot: CatalogCacheSnapshot): void {
  if (typeof window === 'undefined') return
  try {
    const serialized = JSON.stringify(snapshot)
    // Skip oversized snapshots rather than risk evicting other localStorage keys.
    if (serialized.length > MAX_CHARS) return
    window.localStorage.setItem(KEY, serialized)
  } catch {
    // Quota exceeded or private-mode storage — the cache is best-effort.
  }
}

export function loadCatalogCache(): CatalogCacheSnapshot | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CatalogCacheSnapshot>
    if (
      parsed &&
      typeof parsed.savedAt === 'number' &&
      Array.isArray(parsed.metadataItems) &&
      Array.isArray(parsed.profileItems)
    ) {
      return parsed as CatalogCacheSnapshot
    }
    // Shape mismatch (schema drift) — drop it.
    window.localStorage.removeItem(KEY)
    return null
  } catch {
    // Corrupt JSON — drop it so it never resurfaces.
    window.localStorage.removeItem(KEY)
    return null
  }
}

export function clearCatalogCache(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
