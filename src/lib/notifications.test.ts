import { describe, expect, it } from 'vitest'
import { describeNotification } from './notifications'
import type { ApiNotification } from '@/lib/api'

describe('restart lock notifications', () => {
  it('opens the Encryption tab of the bucket on the node that restarted', () => {
    const notification: ApiNotification = {
      id: 'notification-2', category: 'bucket.encryption', kind: 'bucket_locked_by_restart',
      class: 'direct', created_at_ms: 1, read: false, bucket: 'reef', node_id: 'node-b', group_id: 'group-1',
    }
    const display = describeNotification(notification, { groupName: () => undefined })
    expect(display.title).toBe('A node restart locked reef')
    expect(display.link).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef' },
      query: { tab: 'encryption', node: 'node-b', group: 'group-1' },
    })
  })
})

describe('recovery notifications', () => {
  it('says the key recovery is weakened and opens the Encryption tab on the hosting node', () => {
    const notification: ApiNotification = {
      id: 'notification-3', category: 'bucket.encryption', kind: 'bucket_recovery_degraded',
      class: 'direct', created_at_ms: 1, read: false, bucket: 'reef', node_id: 'node-b', group_id: 'group-1',
    }
    const display = describeNotification(notification, { groupName: () => undefined })
    expect(display.title).toBe('The key recovery of reef is weakened')
    expect(display.detail).toContain('Grant the key to another holder')
    expect(display.link).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef' },
      query: { tab: 'encryption', node: 'node-b', group: 'group-1' },
    })
  })
})

describe('key pending notifications', () => {
  it('names the waiting member and opens the bucket on its node', () => {
    const notification: ApiNotification = {
      id: 'notification-4', category: 'bucket.encryption', kind: 'bucket_key_pending', class: 'direct',
      created_at_ms: 1, read: false, bucket: 'reef', node_id: 'node-b', group_id: 'group-1', member_user_id: 'ada',
    }
    const display = describeNotification(notification, { groupName: () => undefined })
    expect(display.title).toBe('ada is waiting for encryption keys for reef')
    expect(display.link).toEqual({ name: 'bucket', params: { bucketId: 'reef' }, query: { node: 'node-b' } })
  })
})

describe('join request notifications', () => {
  it('names the group and opens its Members tab', () => {
    const notification: ApiNotification = {
      id: 'notification-1', category: 'group.membership', kind: 'group_join_requested',
      class: 'direct', created_at_ms: 1, read: false, group_id: 'group-1', request_id: 'request-1',
    }
    const display = describeNotification(notification, { groupName: () => 'Research lab' })
    expect(display.title).toBe('New member request for Research lab')
    expect(display.link).toEqual({ name: 'group', params: { id: 'group-1' }, query: { tab: 'members' } })
  })
})

describe('share upload notifications', () => {
  it('names the file a visitor uploaded and opens it on its node', () => {
    const notification: ApiNotification = {
      id: 'notification-9', category: 'shares', kind: 'share_upload', class: 'direct', created_at_ms: 1, read: false,
      share_id: 'S1', node_id: 'node-b', group_id: 'group-1', bucket: 'reef', key: 'inbox/report (1).pdf', size_bytes: 2048,
    }
    const display = describeNotification(notification, { groupName: () => undefined })
    expect(display.title).toBe('A visitor uploaded a file through your link')
    expect(display.detail).toBe('reef/inbox/report (1).pdf, 2\u00a0KiB')
    expect(display.link).toEqual({ name: 'bucket', params: { bucketId: 'reef' }, query: { prefix: 'inbox', node: 'node-b', object: 'inbox/report (1).pdf' } })
  })
})

describe('sync notifications', () => {
  it('opens the transfers of the bucket on its node with the sync marked', () => {
    const notification: ApiNotification = {
      id: 'notification-5', category: 'data.sync', kind: 'sync_completed', class: 'direct', created_at_ms: 1,
      read: false, bucket: 'reef', node_id: 'node-b', relationship_id: 's-1', versions_synced: 2,
    }
    const display = describeNotification(notification, { groupName: () => undefined })
    expect(display.detail).toBe('2 versions synced')
    expect(display.link).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef' },
      query: { tab: 'transfers', node: 'node-b', sync: 's-1' },
    })
  })

  it('still opens the transfers when a failure names no sync', () => {
    const notification: ApiNotification = {
      id: 'notification-6', category: 'data.sync', kind: 'sync_failed', class: 'direct', created_at_ms: 1,
      read: false, bucket: 'reef', error: 'target unreachable',
    }
    const display = describeNotification(notification, { groupName: () => undefined })
    expect(display.detail).toBe('target unreachable')
    expect(display.link).toEqual({ name: 'bucket-storage', params: { bucketId: 'reef' }, query: { tab: 'transfers' } })
  })
})
