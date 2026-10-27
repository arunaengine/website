import {
  approveDatabaseRequest as requestApprove,
  dropDatabaseRequest as requestDrop,
  listDatabaseRequests as requestRequests,
  listDatabases as requestList,
  markDatabase as requestMark,
  removeDatabase as requestRemove,
  setDatabaseParser as requestParser,
  testDatabaseParser as requestParserTest,
  type FoundIdentifier,
  type IdentifierParser,
  type DatabaseEntryView,
  type DatabaseListQuery,
  type DatabaseListResponse,
  type DatabaseRequestView,
  type MarkDatabaseRequest,
  type MarkDatabaseResponse,
} from '@/lib/api'
import { refreshContext, saving } from './state'

// ── Databases of the realm ──────────────────────────────────────────────────

export function listDatabases(query: DatabaseListQuery = {}, signal?: AbortSignal): Promise<DatabaseListResponse> {
  return requestList(query, refreshContext().client, signal)
}

async function change<T>(work: (client: ReturnType<typeof refreshContext>['client']) => Promise<T>): Promise<T> {
  saving.value = true
  try {
    return await work(refreshContext().client)
  } finally {
    saving.value = false
  }
}

export const markDatabase = (body: MarkDatabaseRequest): Promise<MarkDatabaseResponse> =>
  change((client) => requestMark(body, client))

export const removeDatabase = (entryId: string): Promise<void> => change((client) => requestRemove(entryId, client))

export function listDatabaseRequests(): Promise<DatabaseRequestView[]> {
  return requestRequests(refreshContext().client)
}

export const approveDatabaseRequest = (requestId: string): Promise<DatabaseEntryView> =>
  change((client) => requestApprove(requestId, client))

export const dropDatabaseRequest = (requestId: string): Promise<void> =>
  change((client) => requestDrop(requestId, client))

export const setDatabaseParser = (entryId: string, parser: IdentifierParser | null): Promise<void> =>
  change((client) => requestParser(entryId, parser, client))

export function testDatabaseParser(body: { parser: IdentifierParser; key: string; source_url?: string | null }): Promise<FoundIdentifier[]> {
  return requestParserTest(body, refreshContext().client)
}
