<script setup lang="ts">
// The rules a bucket puts on its objects, as a column beside a file's copies.
// Policy only: it says where a copy MAY be, never where one is.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { policyOwnerLabel } from '@/lib/placementPolicies'
import type { PolicyRefBody } from '@/lib/placementPolicies'
import { truncateMiddle } from '@/lib/utils'

const props = defineProps<{ bucket: string; nodeId: string | null }>()

const { myGroups } = useAruna()
const { getBucketPlacement, policyName } = usePlacementPolicies()

const policies = ref<PolicyRefBody[] | null>(null)
const state = ref<'loading' | 'ready' | 'unknown'>('loading')
const groupName = computed(() => new Map(myGroups.value.map((group) => [group.id, group.name])))

let sequence = 0
async function load() {
  const request = ++sequence
  policies.value = null
  // A bucket on another node is a different bucket here, so this node's answer
  // for the same name would describe the wrong thing.
  if (props.nodeId) {
    state.value = 'unknown'
    return
  }
  state.value = 'loading'
  try {
    const placement = await getBucketPlacement(props.bucket)
    if (request !== sequence) return
    policies.value = placement.policies
    state.value = 'ready'
  } catch {
    if (request === sequence) state.value = 'unknown'
  }
}

watch(() => [props.bucket, props.nodeId], () => void load(), { immediate: true })

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
      <p class="text-[11px] text-muted-foreground">A copy has to be allowed by all of them.</p>
    </template>
    <p v-else class="text-xs text-muted-foreground">None: copies of this file are not governed.</p>

    <div class="flex flex-wrap items-center gap-3">
      <RouterLink
        v-if="!props.nodeId"
        :to="{ name: 'bucket-storage', params: { bucketId: props.bucket }, query: { tab: 'placement' } }"
        class="text-xs font-medium text-primary hover:underline"
      >
        Open the bucket rules
      </RouterLink>
      <DocsLink topic="where-data-lives" section="Placement policies" label="Learn about placement policies" />
    </div>
  </div>
</template>
