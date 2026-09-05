// Keeps the unlocked master key in this browser as a non-extractable WebCrypto
// key, so the passphrase is asked once per browser rather than per tab. A
// browser without IndexedDB gets no store and the key lives in memory only.

const DB_NAME = 'aruna.vault'
const STORE_NAME = 'keys'

export interface VaultKeyStore {
  load(scope: string): Promise<CryptoKey | null>
  save(scope: string, key: CryptoKey): Promise<void>
  remove(scope: string): Promise<void>
}

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
  return settled(request)
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await settled(run(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME)))
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
  }
}
