import type { ContextEntity } from '@/lib/crate/build'

export type LookupKind = 'person' | 'organization'
export type LookupProviderStatus = 'ok' | 'offline' | 'error'

export interface LookupHit {
  id: string
  label: string
  description?: string
  providerId: string
  entity: ContextEntity
  relatedEntities: ContextEntity[]
}

export interface LookupSearchOptions {
  limit: number
  signal?: AbortSignal
}

export interface LookupProvider {
  id: string
  label: string
  kind: LookupKind
  search(query: string, options: LookupSearchOptions): Promise<LookupHit[]>
}

export interface LookupUpdate {
  providerId: string
  providerLabel: string
  status: LookupProviderStatus
  hits: LookupHit[]
}

export class LookupResponseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'LookupResponseError'
  }
}
