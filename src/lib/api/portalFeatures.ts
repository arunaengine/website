// Realm defaults of the portal feature switches (/system/realm/portal-features).
// Any realm member reads them; a realm admin replaces the whole map.
import { apiRequest, type ApiClientOptions } from './client'

export interface PortalFeaturesResponse {
  features: Record<string, boolean>
}

export function getPortalFeatures(client: ApiClientOptions = {}) {
  return apiRequest<PortalFeaturesResponse>('/system/realm/portal-features', {}, client)
}

export function setPortalFeatures(features: Record<string, boolean>, client: ApiClientOptions = {}) {
  return apiRequest<PortalFeaturesResponse>(
    '/system/realm/portal-features',
    { method: 'PUT', body: JSON.stringify({ features }) },
    client,
  )
}
