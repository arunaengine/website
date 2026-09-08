import { describe, expect, it } from 'vitest'
import { describeNotification } from './notifications'
import type { ApiNotification } from '@/lib/api'

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
