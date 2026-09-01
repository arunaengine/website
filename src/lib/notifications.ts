import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { AlertTriangle, ArrowLeftRight, Bell, FileJson2, HardDrive, Upload, UserMinus, UserPlus, Users } from '@lucide/vue'
import type { ApiNotification } from '@/lib/api'
import { formatBytes, truncateMiddle } from '@/lib/utils'

// Lookup helpers the caller can provide so titles use display names the portal
// already knows (never fetched per notification).
export interface NotificationDisplayContext {
  groupName(groupId: string): string | undefined
}

export interface NotificationKindDescriptor {
  icon: Component
  title(n: ApiNotification, ctx: NotificationDisplayContext): string
  detail(n: ApiNotification, ctx: NotificationDisplayContext): string | undefined
  // null = not linkable; the row still renders and can be marked read.
  link(n: ApiNotification): RouteLocationRaw | null
}

function groupLabel(n: ApiNotification, ctx: NotificationDisplayContext): string {
  if (!n.group_id) return 'a group'
  return ctx.groupName(n.group_id) ?? truncateMiddle(n.group_id)
}

// Object keys prefixed with the S3 key's parent folder open the bucket at that prefix.
function keyPrefix(key: string): string {
  return key.split('/').slice(0, -1).join('/')
}

// Registry of the notification kinds the backend actually emits (stable
// `name()` strings; see aruna docs/design/notifications.md §9). A kind nobody
// emits is not registered: an unknown kind already degrades to a generic row,
// so an entry here is a promise that the row can arrive.
export const NOTIFICATION_KINDS: Record<string, NotificationKindDescriptor> = {
  added_to_group: {
    icon: UserPlus,
    title: (n, ctx) => `You were added to ${groupLabel(n, ctx)}`,
    detail: () => undefined,
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id } } : { name: 'groups' }),
  },
  removed_from_group: {
    icon: UserMinus,
    title: (n, ctx) => `You were removed from ${groupLabel(n, ctx)}`,
    detail: () => undefined,
    // Membership is gone, so the detail page would 403; link to the list.
    link: () => ({ name: 'groups' }),
  },
  group_member_added: {
    icon: Users,
    title: (n, ctx) => `New member in ${groupLabel(n, ctx)}`,
    detail: (n) => (n.member_user_id ? `Member ${truncateMiddle(n.member_user_id)}` : undefined),
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id } } : { name: 'groups' }),
  },
  node_onboarded: {
    icon: HardDrive,
    title: () => 'A node joined the realm',
    detail: (n) => (n.node_id ? truncateMiddle(n.node_id) : undefined),
    // StatusView reads route.query.node to focus a node.
    link: (n) => ({ name: 'status', query: n.node_id ? { node: n.node_id } : {} }),
  },
  metadata_created: {
    icon: FileJson2,
    title: () => 'New dataset',
    detail: (n) => n.path,
    link: (n) => (n.document_id ? { name: 'dataset', params: { id: n.document_id } } : null),
  },
  data_uploaded: {
    icon: Upload,
    title: () => 'Data uploaded',
    detail: (n) => {
      if (!n.bucket || !n.key) return n.path
      const size = typeof n.size_bytes === 'number' ? ` · ${formatBytes(n.size_bytes)}` : ''
      return `${n.bucket}/${n.key}${size}`
    },
    link: (n) => {
      if (!n.bucket) return null
      const prefix = n.key ? keyPrefix(n.key) : ''
      return { name: 'bucket', params: { bucketId: n.bucket }, query: prefix ? { prefix } : {} }
    },
  },
  // ── Bucket sync (aruna feat/portal_extensions) ─────────────────────────────
  // Emitted for s3-namespace watches when a sync relationship finishes a run
  // (sync_completed with versions_synced) or records a failure (sync_failed
  // with the error text). Both carry bucket + node_id; the deep link opens the
  // bucket on its hosting node (Data treats the local node id in
  // ?node= as the connected node).
  sync_completed: {
    icon: ArrowLeftRight,
    title: (n) => (n.bucket ? `Bucket sync completed for ${n.bucket}` : 'Bucket sync completed'),
    detail: (n) =>
      typeof n.versions_synced === 'number'
        ? `${n.versions_synced} version${n.versions_synced === 1 ? '' : 's'} synced`
        : n.path,
    link: (n) =>
      n.bucket
        ? { name: 'bucket', params: { bucketId: n.bucket }, query: n.node_id ? { node: n.node_id } : {} }
        : null,
  },
  sync_failed: {
    icon: AlertTriangle,
    title: (n) => (n.bucket ? `Bucket sync failed for ${n.bucket}` : 'Bucket sync failed'),
    detail: (n) => n.error ?? n.path,
    link: (n) =>
      n.bucket
        ? { name: 'bucket', params: { bucketId: n.bucket }, query: n.node_id ? { node: n.node_id } : {} }
        : null,
  },
}

export interface NotificationDisplay {
  icon: Component
  title: string
  detail?: string
  link: RouteLocationRaw | null
}

// Unknown kinds (newer backends) degrade to a generic, unlinked row.
export function describeNotification(
  n: ApiNotification,
  ctx: NotificationDisplayContext,
): NotificationDisplay {
  const descriptor = NOTIFICATION_KINDS[n.kind]
  if (!descriptor) {
    return { icon: Bell, title: n.kind.replace(/_/g, ' '), detail: n.path, link: null }
  }
  return {
    icon: descriptor.icon,
    title: descriptor.title(n, ctx),
    detail: descriptor.detail(n, ctx),
    link: descriptor.link(n),
  }
}
