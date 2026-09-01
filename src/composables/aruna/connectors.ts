import {
  ApiError,
  type ConnectorCheckResponse,
  type ConnectorEntriesResponse,
  type ListSourceConnectorsResponse,
  type SourceConnectorRequest,
  type SourceConnectorSummary,
} from '@/lib/api'
import { request, saving } from './state'

// Source connectors registered on a group (GET /data/groups/{group_id}/connectors).
export async function listGroupConnectors(groupId: string): Promise<ListSourceConnectorsResponse> {
  return request<ListSourceConnectorsResponse>(`/data/groups/${groupId}/connectors`)
}

export async function getGroupConnector(groupId: string, connectorId: string): Promise<SourceConnectorSummary> {
  return request<SourceConnectorSummary>(`/data/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}`)
}

export async function createGroupConnector(
  groupId: string,
  input: SourceConnectorRequest,
): Promise<SourceConnectorSummary> {
  saving.value = true
  try {
    return await request<SourceConnectorSummary>(`/data/groups/${groupId}/connectors`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  } finally {
    saving.value = false
  }
}

// PUT replaces the whole connector, secrets included: an empty secret_config
// removes any stored credentials (there is no partial update on the backend).
export async function replaceGroupConnector(
  groupId: string,
  connectorId: string,
  input: SourceConnectorRequest,
): Promise<SourceConnectorSummary> {
  saving.value = true
  try {
    return await request<SourceConnectorSummary>(
      `/data/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    )
  } finally {
    saving.value = false
  }
}

export async function deleteGroupConnector(groupId: string, connectorId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/data/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}`, {
      method: 'DELETE',
    })
  } finally {
    saving.value = false
  }
}

// Connector check & browse (agreed contract; new endpoints: callers treat
// 404/405/501 as "not supported by this node yet" and degrade).
export async function checkConnectorConfig(
  groupId: string,
  input: SourceConnectorRequest,
): Promise<ConnectorCheckResponse> {
  return request<ConnectorCheckResponse>(`/data/groups/${groupId}/connectors/check`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function checkGroupConnector(groupId: string, connectorId: string): Promise<ConnectorCheckResponse> {
  return request<ConnectorCheckResponse>(
    `/data/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}/check`,
    { method: 'POST' },
  )
}

export async function listConnectorEntries(
  groupId: string,
  connectorId: string,
  path?: string,
  limit?: number,
): Promise<ConnectorEntriesResponse> {
  return request<ConnectorEntriesResponse>(
    `/data/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}/entries`,
    { query: { path: path || undefined, limit } },
  )
}

// True when an error means the (new-contract) endpoint is absent on this node.
export function isUnsupportedEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 501)
}
