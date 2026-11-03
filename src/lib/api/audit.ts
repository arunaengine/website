// Metadata audit trail (GET /metadata/audit, verified against aruna api/src/routes/audit.rs).
// Group admins only; a page merges every node's rows, oldest first.
export interface AuditRecord {
  group_id: string
  document_id: string
  graph_iri: string
  user_id: string
  node_id: string
  operation: string
  occurred_at_ms: number
  details?: string
}

export interface AuditPage {
  records: AuditRecord[]
  // Absent on a partial page; on a complete page an absent cursor ends the trail.
  next_cursor?: string
  partial: boolean
  missing_nodes?: string[]
  missing_overflow: number
}

export interface AuditQuery {
  documentId?: string
  cursor?: string
  limit?: number
}
