import { computed } from 'vue'
import { useAruna } from './useAruna'
import type { Bucket, Invitation, ActivityEvent, User } from '@/data/types'

export function useRealm() {
  const aruna = useAruna()
  const activeRealmId = computed(() => aruna.realm.value.id)
  // Display name comes from the realm description (id prefix as fallback);
  // the raw realm id is exposed separately for tooltips and copy affordances.
  const realmDisplayName = computed(() => aruna.realm.value.name)
  const realmId = computed(() => aruna.realm.value.id)
  const accessibleRealms = computed(() => [aruna.realm.value])
  const myMemberships = computed(() => {
    const user = aruna.userInfo.value
    if (!user) return []
    const role = user.realm.roles[0]?.name ? `realm-${user.realm.roles[0].name}` : 'realm-member'
    return [{ userId: user.user.user_id, realmId: user.realm.realm_id, role, since: '' }]
  })
  const role = computed(() => myMemberships.value[0]?.role ?? 'anonymous')
  return {
    activeRealmId,
    realm: aruna.realm,
    realmDisplayName,
    realmId,
    realms: computed(() => [aruna.realm.value]),
    role,
    accessibleRealms,
    myMemberships,
    setRealm(_id: string) {
      // Aruna REST currently exposes the local realm only.
    },
    nodes: aruna.nodes,
    buckets: computed<Bucket[]>(() => []),
    groups: aruna.groups,
    members: computed<User[]>(() => []),
    metadata: aruna.metadata,
    activity: computed<ActivityEvent[]>(() => []),
    invitations: computed<Invitation[]>(() => []),
    quota: computed(() => ({ used: 0, quota: 0 })),
  }
}
