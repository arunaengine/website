export type LookupKind = 'person' | 'organization'
export type LookupProviderStatus = 'ok' | 'offline' | 'error'

/** A crate entity a registry answered with, in plain JSON-LD terms. */
export interface ContextEntity {
  id: string
  type: string | string[]
  properties: Record<string, unknown>
  /** Root properties this entity should be linked from, e.g. author. */
  roles: string[]
}

export interface LookupHit {
  id: string
  label: string
  description?: string
  providerId: string
  entity: ContextEntity
  relatedEntities: ContextEntity[]
}

/** One record fetched from a registry by its identifier. */
export interface RegistryRecord {
  /** The canonical registry URL, used as the entity's @id. */
  id: string
  name: string
  givenName?: string
  familyName?: string
  url?: string
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
