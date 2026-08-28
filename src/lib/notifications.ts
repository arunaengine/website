import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { AlertTriangle, ArrowLeftRight, Ban, Bell, Check, FileJson2, HardDrive, Inbox, Upload, UserMinus, UserPlus, Users } from '@lucide/vue'
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

// Registry of backend notification kinds (stable `name()` strings; see
// aruna docs/design/notifications.md §9, append-only). Later portal branches
// extend this by ADDING entries here: e.g. issue #248 adds `join_request_*`
// kinds linking to the group's requests tab, issue #250 adds quota-transition
// kinds linking to the admin/usage views. Never remove or rename entries.
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
  // ── Join requests (aruna#248) ──────────────────────────────────────────────
  // NOT emitted by any backend yet. Names follow the backend's snake_case
  // NotificationKind::name() convention (added_to_group, group_member_added, …);
  // the dotted aliases cover the alternative naming from the portal-side design
  // notes, so whichever the backend picks is handled. These entries are static
  // (not wrapped in featureEnabled): the registry is a plain Record and an entry
  // for a kind that can only arrive once the backend implements aruna#248 is
  // inert with the flag off, so registering it unconditionally is honest.
  // Deep links target the group workflow: created → the admin inbox in the
  // group detail (commit 4); decided → the requester's own-requests section
  // (commit 3) via the #join-requests anchor.
  join_request_created: {
    icon: Inbox,
    title: (n, ctx) => `New join request for ${groupLabel(n, ctx)}`,
    detail: (n) => (n.actor_user_id ? `From ${truncateMiddle(n.actor_user_id)}` : undefined),
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id } } : { name: 'groups' }),
  },
  join_request_decided: {
    icon: Check,
    title: (n, ctx) => `Your join request for ${groupLabel(n, ctx)} was reviewed`,
    detail: () => undefined,
    link: () => ({ name: 'groups', hash: '#join-requests' }),
  },
  'group.join_request.created': {
    icon: Inbox,
    title: (n, ctx) => `New join request for ${groupLabel(n, ctx)}`,
    detail: (n) => (n.actor_user_id ? `From ${truncateMiddle(n.actor_user_id)}` : undefined),
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id } } : { name: 'groups' }),
  },
  'group.join_request.decided': {
    icon: Check,
    title: (n, ctx) => `Your join request for ${groupLabel(n, ctx)} was reviewed`,
    detail: () => undefined,
    link: () => ({ name: 'groups', hash: '#join-requests' }),
  },
  // ── Quota state (aruna#250) ─────────────────────────────────────────────────
  // NOT emitted by any backend yet. Two spellings covered: the backend's
  // snake_case NotificationKind::name() convention (quota_warned/quota_blocked)
  // and the dotted names from the issue text (quota.warned/quota.blocked).
  // Static entries (not wrapped in featureEnabled): a kind that can only arrive
  // once the backend emits it is inert until then. Both deep-link to the
  // group's #storage section (anchor added in the quota-reporting UI).
  quota_warned: {
    icon: AlertTriangle,
    title: (n, ctx) => `Storage nearing quota for ${groupLabel(n, ctx)}`,
    detail: () => undefined,
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id }, hash: '#storage' } : { name: 'groups' }),
  },
  quota_blocked: {
    icon: Ban,
    title: (n, ctx) => `Storage quota exceeded for ${groupLabel(n, ctx)}`,
    detail: () => 'Uploads are blocked until storage is freed or the quota is raised.',
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id }, hash: '#storage' } : { name: 'groups' }),
  },
  'quota.warned': {
    icon: AlertTriangle,
    title: (n, ctx) => `Storage nearing quota for ${groupLabel(n, ctx)}`,
    detail: () => undefined,
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id }, hash: '#storage' } : { name: 'groups' }),
  },
  'quota.blocked': {
    icon: Ban,
    title: (n, ctx) => `Storage quota exceeded for ${groupLabel(n, ctx)}`,
    detail: () => 'Uploads are blocked until storage is freed or the quota is raised.',
    link: (n) => (n.group_id ? { name: 'group', params: { id: n.group_id }, hash: '#storage' } : { name: 'groups' }),
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
