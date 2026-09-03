<script setup lang="ts">
// What a bucket reader needs in one look. What the bucket holds sits in one
// card, the rules it carries in another, what this node observed in a third,
// and every observed line names the node it came from. Nothing here invents a
// number the backend cannot give.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import DocsLink from '@/components/ui/DocsLink.vue'
import DetailList from '@/components/ui/DetailList.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketSyncs } from '@/composables/useBucketSyncs'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import {
  ApiError,
  type BucketUsageResponse,
  type GroupBackendResponse,
  type RoutingTarget,
  type StorageRoutingRule,
} from '@/lib/api'
import type { PolicyRefBody } from '@/lib/placementPolicies'
import { targetLabel } from '@/lib/storage'
import { formatBytes, formatNumber } from '@/lib/utils'
import { Database, HardDrive, ShieldCheck } from '@lucide/vue'

const props = defineProps<{ bucket: string; groupId: string | null; nodeId: string | null }>()

const { getBucketRouting, getBucketUsage, getGroupRouting, listGroupBackends } = useAruna()
const { getBucketPlacement, policyName } = usePlacementPolicies()

const bucket = computed(() => props.bucket)
const nodeId = computed(() => props.nodeId)
const { rows: syncRows, loading: syncsLoading, error: syncsError, load: loadSyncs } = useBucketSyncs(
  bucket,
  nodeId,
)

const rules = ref<StorageRoutingRule[] | null>(null)
const groupTarget = ref<RoutingTarget | null>(null)
const backends = ref<GroupBackendResponse[]>([])
const routingState = ref<'loading' | 'ready' | 'refused' | 'unknown'>('loading')
const policies = ref<PolicyRefBody[] | null>(null)
const policyState = ref<'loading' | 'ready' | 'refused' | 'unknown'>('loading')
const usage = ref<BucketUsageResponse | null>(null)
// 'missing': this node does not serve the route, so the card stays away.
const usageState = ref<'loading' | 'ready' | 'missing' | 'failed'>('loading')

// A bucket hosted on another node is a different bucket here, so this node's
// answer for the same name would describe the wrong thing.
const remote = computed(() => Boolean(props.nodeId))

function refused(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

async function load() {
  void loadSyncs()
  if (remote.value) {
    routingState.value = 'unknown'
    policyState.value = 'unknown'
    usageState.value = 'missing'
    return
  }
  routingState.value = 'loading'
  policyState.value = 'loading'
  usageState.value = 'loading'
  usage.value = null
  const pending: Promise<unknown>[] = [
    getBucketUsage(props.bucket)
      .then((counted) => {
        usage.value = counted
        usageState.value = 'ready'
      })
      .catch((error) => {
        const older = error instanceof ApiError && error.status === 404
        usageState.value = older ? 'missing' : 'failed'
      }),
    getBucketRouting(props.bucket)
      .then((routing) => {
        rules.value = routing.rules
        routingState.value = 'ready'
      })
      .catch((error) => {
        routingState.value = refused(error) ? 'refused' : 'unknown'
      }),
    getBucketPlacement(props.bucket)
      .then((placement) => {
        policies.value = placement.policies
        policyState.value = 'ready'
      })
      .catch((error) => {
        policyState.value = refused(error) ? 'refused' : 'unknown'
      }),
  ]
  if (props.groupId) {
    pending.push(
      getGroupRouting(props.groupId)
        .then((response) => {
          groupTarget.value = response.default_target ?? null
        })
        .catch(() => undefined),
      listGroupBackends(props.groupId)
        .then((response) => {
          backends.value = response.backends
        })
        .catch(() => undefined),
    )
  }
  await Promise.all(pending)
}

watch(() => [props.bucket, props.groupId, props.nodeId], () => void load(), { immediate: true })

const bucketDefaultRule = computed(
  () => rules.value?.find((rule) => !rule.exact && !rule.key_prefix) ?? null,
)

const REMOTE = { value: 'Unknown here', note: 'This bucket is hosted on another node.' }
const NO_ANSWER = { value: 'Unknown', note: 'This node did not answer.' }

// A node that refuses the routing read says nothing about the bucket, so the
// detail is left out rather than filled with a refusal.
const backendKnown = computed(() => routingState.value !== 'refused')

const backend = computed(() => {
  if (remote.value) return REMOTE
  if (routingState.value === 'loading' || routingState.value === 'refused') return null
  if (routingState.value === 'unknown') return NO_ANSWER
  const count = rules.value?.length ?? 0
  if (bucketDefaultRule.value) {
    return {
      value: targetLabel(bucketDefaultRule.value.target, backends.value),
      note: count > 1 ? `Set by a bucket rule; ${count} rules decide per key.` : 'Set by the bucket rule.',
    }
  }
  if (count) {
    return { value: 'Depends on the key', note: `${count} bucket rules; the group default takes the rest.` }
  }
  if (groupTarget.value) {
    return { value: targetLabel(groupTarget.value, backends.value), note: 'Set by the group default.' }
  }
  return { value: 'Node default', note: 'No bucket rule and no group default.' }
})

const policySummary = computed(() => {
  if (remote.value) return REMOTE
  if (policyState.value === 'loading') return null
  if (policyState.value === 'refused') {
    return { value: 'Not shown', note: 'Only group admins and realm admins may read it.' }
  }
  if (policyState.value === 'unknown') return NO_ANSWER
  if (!policies.value?.length) return { value: 'None', note: 'Copies of this bucket are not governed.' }
  return { value: policies.value.map(policyName).join(', '), note: 'A copy has to be allowed by all of them.' }
})

const syncSummary = computed(() => {
  if (syncsLoading.value && !syncRows.value.length) return null
  if (syncsError.value) return { value: 'Unknown', note: 'The sync list could not be read.' }
  if (!syncRows.value.length) return { value: 'None', note: 'Only syncs you created are counted.' }
  const out = syncRows.value.filter((row) => row.direction === 'outgoing').length
  return { value: `${out} out, ${syncRows.value.length - out} in`, note: 'Only syncs you created are counted.' }
})

// Lower bounds when the node stopped its scan at the cap.
function counted(value: number): string {
  const number = formatNumber(value)
  return usage.value?.complete === false ? `at least ${number}` : number
}

const usageDetails = computed(() => {
  const held = usage.value
  if (!held) return []
  const size = formatBytes(held.logical_bytes)
  return [
    { key: 'size', label: 'Size', value: held.complete ? size : `at least ${size}` },
    { key: 'objects', label: 'Objects', value: counted(held.objects) },
    { key: 'versions', label: 'Versions', value: counted(held.versions) },
    { key: 'markers', label: 'Delete markers', value: counted(held.delete_markers) },
    { key: 'uploads', label: 'Open multipart uploads', value: counted(held.open_multipart_uploads) },
  ]
})

const bucketEmpty = computed(() => {
  const held = usage.value
  if (!held?.complete) return false
  return !held.objects && !held.versions && !held.delete_markers && !held.open_multipart_uploads
})

const ruleDetails = computed(() => [
  ...(backendKnown.value
    ? [{ key: 'backend', label: 'Storage backend', value: backend.value?.value ?? '' }]
    : []),
  { key: 'policies', label: 'Placement policies', value: policySummary.value?.value ?? '' },
])
const observedDetails = computed(() => [
  { key: 'copies', label: 'Copies', value: 'Checked per file' },
  { key: 'syncs', label: 'Syncs', value: syncSummary.value?.value ?? '' },
])
const filesLink = computed(() => ({
  name: 'bucket',
  params: { bucketId: props.bucket },
  query: props.nodeId ? { node: props.nodeId } : {},
}))
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <section v-if="usageState !== 'missing'" class="surface lg:col-span-2">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <Database class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">What this bucket holds</h2>
      </header>
      <div class="px-5 py-4">
        <Skeleton v-if="usageState === 'loading'" class="h-14 w-full" />
        <p v-else-if="usageState === 'failed'" class="text-sm text-muted-foreground">
          This node did not answer, so the numbers are unknown right now.
        </p>
        <p v-else-if="bucketEmpty" class="text-sm text-muted-foreground">
          This bucket is empty: nothing is stored in it yet.
        </p>
        <template v-else>
          <DetailList :items="usageDetails" class="sm:grid-cols-3 lg:grid-cols-5" />
          <p v-if="usage && !usage.complete" class="mt-3 text-[11px] text-muted-foreground">
            The scan stopped at its limit, so every number here is a lower bound.
          </p>
        </template>
      </div>
    </section>

    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <ShieldCheck class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Rules this bucket carries</h2>
      </header>
      <div class="px-5 py-4">
        <DetailList :items="ruleDetails" class="sm:grid-cols-1">
          <template #backend>
            <Skeleton v-if="!backend" class="h-4 w-40" />
            <template v-else>
              <span class="block">{{ backend.value }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">
                {{ backend.note }}
                <DocsLink icon topic="where-data-lives" section="Storage backend" class="ml-0.5" />
              </span>
            </template>
          </template>
          <template #policies>
            <Skeleton v-if="!policySummary" class="h-4 w-40" />
            <template v-else>
              <span class="block">{{ policySummary.value }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">
                {{ policySummary.note }}
                <DocsLink icon topic="where-data-lives" section="Placement policies" class="ml-0.5" />
              </span>
            </template>
          </template>
        </DetailList>
      </div>
    </section>

    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <HardDrive class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Observed on this node</h2>
      </header>
      <div class="px-5 py-4">
        <DetailList :items="observedDetails" class="sm:grid-cols-1">
          <template #copies>
            <span class="block">Checked per file</span>
            <span class="mt-0.5 block text-[11px] text-muted-foreground">
              <RouterLink :to="filesLink" class="font-medium text-primary hover:underline">Open a file</RouterLink>
              to see where its copies are.
              <DocsLink icon topic="where-data-lives" section="Storage locations" class="ml-0.5" />
            </span>
          </template>
          <template #syncs>
            <Skeleton v-if="!syncSummary" class="h-4 w-24" />
            <template v-else>
              <span class="block">{{ syncSummary.value }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">
                {{ syncSummary.note }}
                <DocsLink icon topic="where-data-lives" section="Syncs" class="ml-0.5" />
              </span>
            </template>
          </template>
        </DetailList>
      </div>
    </section>
  </div>
</template>
