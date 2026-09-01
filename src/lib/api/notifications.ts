// --- Notifications (GET /system/notifications, /system/notifications/unread, POST /system/notifications/read) ---

// Backend NotificationResponse. Kind-specific fields are omitted (not null)
// when absent; new kinds appear over time, so `kind`/`category` stay open strings.
export interface ApiNotification {
  id: string
  category: string
  kind: string
  class: 'direct' | 'transient'
  created_at_ms: number
  read: boolean
  group_id?: string
  member_user_id?: string
  actor_user_id?: string
  node_id?: string
  realm_id?: string
  path?: string
  document_id?: string
  bucket?: string
  key?: string
  size_bytes?: number
  // sync_completed / sync_failed (bucket sync watch events)
  relationship_id?: string
  versions_synced?: number
  error?: string
}

export interface NotificationListResponse {
  notifications: ApiNotification[]
  // Opaque base64url cursor; omitted on the last page. Pass back verbatim.
  next_cursor?: string
}

// Bounded lower-bound count: the backend stops counting at 100 and sets capped.
export interface UnreadCountResponse {
  count: number
  capped: boolean
}

export interface NotificationStateResponse {
  epoch: string
  revision: number
  unread: UnreadCountResponse
}

export interface MarkReadRequest {
  ids: string[]
  // Inclusive created_at_ms sweep; ids: [] + up_to_ms marks everything up to it.
  up_to_ms?: number
}

export interface MarkReadResponse {
  marked: number
}

// --- Notification watches (GET/POST /system/notifications/watches, DELETE /system/notifications/watches/{id}) ---

// Backend WatchResponse. `events` carries stable WatchEventKind names
// (metadata_created, data_uploaded); the list stays open for future kinds.
export interface ApiWatch {
  id: string
  path_prefix: string
  events: string[]
  created_at_ms: number
  // Agreed contract addition: newer backends MAY report per-watch health;
  // render it when present, kept an open string for forward compatibility.
  health?: 'active' | 'needs_attention' | string
}

export interface WatchListResponse {
  watches: ApiWatch[]
}

// path_prefix format: `s3/{group_id}/{node_id}/{bucket}/{key-prefix}` for
// data_uploaded, `meta/{group_id}/{document-path-prefix}` for metadata_created.
// The slash after the bucket or group is required, no leading slash, and the
// two namespaces cannot be combined in one watch.
export interface CreateWatchRequest {
  path_prefix: string
  events: string[]
}
