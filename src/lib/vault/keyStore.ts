// Keeps the unlocked master key in this browser as a non-extractable WebCrypto
// key, so the passphrase is asked once per browser rather than per tab. A
// browser without IndexedDB gets no store and the key lives in memory only.
// Next to the key it keeps the last vault heads, so a known browser can still
// unlock while no vault holder answers.
import type { UserVaultHead } from '@/lib/api'

const DB_NAME = 'aruna.vault'
const STORE_NAME = 'keys'
const HEADS_STORE = 'heads'

export interface VaultKeyStore {
  load(scope: string): Promise<CryptoKey | null>
  save(scope: string, key: CryptoKey): Promise<void>
  /** Forgets the key only; the cached heads stay. */
  remove(scope: string): Promise<void>
  loadHeads(scope: string): Promise<UserVaultHead[] | null>
  /** An empty list forgets the cached heads. */
  saveHeads(scope: string, heads: UserVaultHead[]): Promise<void>
  /** Forgets every key and every cached head. */
  clear(): Promise<void>
}

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 2)
  request.onupgradeneeded = () => {
    for (const name of [STORE_NAME, HEADS_STORE]) {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
    }
  }
  return settled(request)
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  name = STORE_NAME,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await settled(run(database.transaction(name, mode).objectStore(name)))
  } finally {
    database.close()
  }
}

export function browserKeyStore(): VaultKeyStore | null {
  if (typeof indexedDB === 'undefined') return null
  return {
    async load(scope) {
      const value = await withStore('readonly', (store) => store.get(scope))
      return value instanceof CryptoKey ? value : null
    },
    async save(scope, key) {
      await withStore('readwrite', (store) => store.put(key, scope))
    },
    async remove(scope) {
      await withStore('readwrite', (store) => store.delete(scope))
    },
    async loadHeads(scope) {
      const value: unknown = await withStore('readonly', (store) => store.get(scope), HEADS_STORE)
      return Array.isArray(value) ? value : null
    },
    async saveHeads(scope, heads) {
      if (heads.length) await withStore('readwrite', (store) => store.put(heads, scope), HEADS_STORE)
      else await withStore('readwrite', (store) => store.delete(scope), HEADS_STORE)
    },
    async clear() {
      await withStore('readwrite', (store) => store.clear())
      await withStore('readwrite', (store) => store.clear(), HEADS_STORE)
    },
  }
}
