import type { AuditPage, AuditQuery } from '@/lib/api'
import { request } from './state'

// A group's metadata audit trail; the node answers 403 to callers without group admin rights.
export async function listGroupAudit(groupId: string, query: AuditQuery = {}): Promise<AuditPage> {
  return request<AuditPage>('/metadata/audit', {
    query: { group_id: groupId, document_id: query.documentId, cursor: query.cursor, limit: query.limit },
  })
}
