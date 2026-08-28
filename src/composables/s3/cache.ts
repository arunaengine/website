import type { S3Client } from '@aws-sdk/client-s3'

// Signed clients keyed by endpoint, session store key and access key id. The
// session layer owns their lifetime, the client factory fills the cache.
export const clientCache = new Map<
  string,
  { storeKey: string; accessKeyId: string; client: S3Client }
>()

export function dropClients(key: string): void {
  for (const [cacheKey, cached] of clientCache) {
    if (cached.storeKey !== key) continue
    cached.client.destroy()
    clientCache.delete(cacheKey)
  }
}

export function destroyClients(): void {
  for (const cached of clientCache.values()) cached.client.destroy()
  clientCache.clear()
}
