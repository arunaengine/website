<script setup lang="ts">
// The rules an object carries, as a column beside a file's copies. Policy only:
// it says where a copy MAY be, never where one is.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { policyOwnerLabel, sameRefSet } from '@/lib/placementPolicies'
import type { PolicyRefBody } from '@/lib/placementPolicies'
import { truncateMiddle } from '@/lib/utils'

const props = defineProps<{ bucket: string; objectKey: string; nodeId: string | null }>()

const { myGroups } = useAruna()
const { getBucketPlacement, getObjectPlacement, policyName } = usePlacementPolicies()

const policies = ref<PolicyRefBody[] | null>(null)
const ownSet = ref(false)
const state = ref<'loading' | 'ready' | 'unknown'>('loading')
const groupName = computed(() => new Map(myGroups.value.map((group) => [group.id, group.name])))

let sequence = 0
// The file's own set wins when this node serves it; the bucket default is what
// a file without one follows anyway.
async function load() {
  const request = ++sequence
  policies.value = null
  ownSet.value = false
  // A bucket on another node is a different bucket here, so this node's answer
  // for the same name would describe the wrong thing.
  if (props.nodeId) {
    state.value = 'unknown'
    return
  }
  state.value = 'loading'
  const [fallback, own] = await Promise.all([
    getBucketPlacement(props.bucket).then((placement) => placement.policies).catch(() => null),
    getObjectPlacement(props.bucket, props.objectKey).then((head) => head.policies).catch(() => null),
  ])
  if (request !== sequence) return
  if (own) {
    policies.value = own
    ownSet.value = Boolean(fallback) && !sameRefSet(own, fallback ?? [])
    state.value = 'ready'
  } else if (fallback) {
    policies.value = fallback
    state.value = 'ready'
  } else state.value = 'unknown'
}

watch(() => [props.bucket, props.objectKey, props.nodeId], () => void load(), { immediate: true })

function owner(policy: PolicyRefBody): string | undefined {
  return policyOwnerLabel(
    policy.owner_group_id,
    policy.owner_group_id ? (groupName.value.get(policy.owner_group_id) ?? null) : null,
  )
}

function label(policy: PolicyRefBody): string {
  return policyName(policy) || truncateMiddle(policy.policy_id)
}
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-xs font-semibold text-foreground">Rules this file carries</h3>

    <Skeleton v-if="state === 'loading'" class="h-4 w-32" />
    <p v-else-if="state === 'unknown'" class="text-xs text-muted-foreground">
      Unknown here.
      <span v-if="props.nodeId">This bucket is hosted on another node.</span>
      <span v-else>This node did not say.</span>
    </p>
    <template v-else-if="policies?.length">
      <ul class="space-y-1">
        <li v-for="policy in policies" :key="`${policy.policy_id}:${policy.digest}`" class="text-xs text-foreground">
          {{ label(policy) }}
          <Badge v-if="owner(policy)" variant="outline" size="sm" class="ml-1">{{ owner(policy) }}</Badge>
        </li>
      </ul>
      <p class="text-[11px] text-muted-foreground">
        A copy has to be allowed by all of them.
        <DocsLink icon topic="where-data-lives" section="Placement policies" class="ml-0.5" />
      </p>
    </template>
    <p v-else class="text-xs text-muted-foreground">
      None: copies of this file are not governed.
      <DocsLink icon topic="where-data-lives" section="Placement policies" class="ml-0.5" />
    </p>
    <p v-if="ownSet" class="text-[11px] text-muted-foreground">This file carries its own rules.</p>

    <RouterLink
      v-if="!props.nodeId"
      :to="{ name: 'bucket-storage', params: { bucketId: props.bucket }, query: { tab: 'placement' } }"
      class="inline-block text-xs font-medium text-primary hover:underline"
    >
      Open the bucket rules
    </RouterLink>
  </div>
</template>
