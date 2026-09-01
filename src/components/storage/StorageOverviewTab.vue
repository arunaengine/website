<script setup lang="ts">
// What a bucket reader needs in one look. The rules the bucket carries sit in
// one card, what this node observed in another, and every observed line names
// the node it came from. Nothing here invents a number the backend cannot give.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import FactList from '@/components/ui/FactList.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketSyncs } from '@/composables/useBucketSyncs'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { ApiError, type GroupBackendResponse, type RoutingTarget, type StorageRoutingRule } from '@/lib/api'
import type { PolicyRefBody } from '@/lib/placementPolicies'
import { targetLabel } from '@/lib/storage'
import { HardDrive, ShieldCheck } from '@lucide/vue'

const props = defineProps<{ bucket: string; groupId: string | null; nodeId: string | null }>()

const { getBucketRouting, getGroupRouting, listGroupBackends } = useAruna()
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
    return
  }
  routingState.value = 'loading'
  policyState.value = 'loading'
  const pending: Promise<unknown>[] = [
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

const backend = computed(() => {
  if (remote.value) return { value: 'Unknown here', note: 'This bucket is hosted on another node.' }
  if (routingState.value === 'loading') return null
  if (routingState.value === 'refused') {
    return { value: 'Not shown', note: 'Only admins of the group that owns this bucket may read it.' }
  }
  if (routingState.value === 'unknown') return { value: 'Unknown', note: 'This node did not answer.' }
  if (bucketDefaultRule.value) {
    return {
      value: targetLabel(bucketDefaultRule.value.target, backends.value),
      note:
        rules.value!.length > 1
          ? `From a bucket rule; ${rules.value!.length} rules decide per key.`
          : 'From the bucket rule for every key.',
    }
  }
  if (rules.value?.length) {
    return {
      value: 'Depends on the key',
      note: `${rules.value.length} bucket rules decide per key, and the group default takes the rest.`,
    }
  }
  if (groupTarget.value) {
    return { value: targetLabel(groupTarget.value, backends.value), note: 'From the group default.' }
  }
  return { value: 'Node default', note: 'No bucket rule and no group default, so this node decides.' }
})

const policySummary = computed(() => {
  if (remote.value) return { value: 'Unknown here', note: 'This bucket is hosted on another node.' }
  if (policyState.value === 'loading') return null
  if (policyState.value === 'refused') {
    return { value: 'Not shown', note: 'Only group admins of this bucket and realm admins may read it.' }
  }
  if (policyState.value === 'unknown') return { value: 'Unknown', note: 'This node did not answer.' }
  if (!policies.value?.length) {
    return { value: 'None: copies of this bucket are not governed', note: 'Any node this realm allows may hold a copy.' }
  }
  return { value: policies.value.map(policyName).join(', '), note: 'A copy has to be allowed by all of them.' }
})

const syncSummary = computed(() => {
  if (syncsLoading.value && !syncRows.value.length) return null
  if (syncsError.value) return { value: 'Unknown', note: 'The sync list could not be read.' }
  const out = syncRows.value.filter((row) => row.direction === 'outgoing').length
  const incoming = syncRows.value.length - out
  if (!syncRows.value.length) return { value: 'None', note: 'Only syncs you created are counted.' }
  return { value: `${out} out, ${incoming} in`, note: 'Only syncs you created are counted.' }
})

const policyFacts = computed(() => [
  { key: 'backend', label: 'Storage backend for new uploads', value: backend.value?.value ?? '' },
  { key: 'policies', label: 'Placement policies', value: policySummary.value?.value ?? '' },
])
const observedFacts = computed(() => [
  { key: 'copies', label: 'Copies', value: 'Checked per file' },
  { key: 'syncs', label: 'Syncs', value: syncSummary.value?.value ?? '' },
])
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <ShieldCheck class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Policy</h2>
        <Badge variant="outline" size="sm">Rules this bucket carries</Badge>
      </header>
      <div class="px-5 py-4">
        <FactList :items="policyFacts" class="sm:grid-cols-1">
          <template #backend>
            <Skeleton v-if="!backend" class="h-4 w-40" />
            <template v-else>
              <span>{{ backend.value }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ backend.note }}</span>
              <DocsLink
                topic="where-data-lives"
                section="Storage backend"
                label="Learn about storage backends"
                class="mt-1"
              />
            </template>
          </template>
          <template #policies>
            <Skeleton v-if="!policySummary" class="h-4 w-40" />
            <template v-else>
              <span>{{ policySummary.value }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ policySummary.note }}</span>
              <DocsLink
                topic="where-data-lives"
                section="Placement policies"
                label="Learn about placement policies"
                class="mt-1"
              />
            </template>
          </template>
        </FactList>
      </div>
    </section>

    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <HardDrive class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Observed on this node</h2>
        <Badge variant="outline" size="sm">What this node could see</Badge>
      </header>
      <div class="px-5 py-4">
        <FactList :items="observedFacts" class="sm:grid-cols-1">
          <template #copies>
            <span>Checked per file</span>
            <span class="mt-0.5 block text-[11px] text-muted-foreground">
              This node reports no total for a bucket, so open a file to see where its copies are.
            </span>
            <div class="mt-1 flex flex-wrap items-center gap-3">
              <RouterLink
                :to="{ name: 'bucket', params: { bucketId: props.bucket }, query: props.nodeId ? { node: props.nodeId } : {} }"
                class="text-xs font-medium text-primary hover:underline"
              >
                Open the file browser
              </RouterLink>
              <DocsLink topic="where-data-lives" section="Storage locations" label="Learn about storage locations" />
            </div>
          </template>
          <template #syncs>
            <Skeleton v-if="!syncSummary" class="h-4 w-24" />
            <template v-else>
              <span>{{ syncSummary.value }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ syncSummary.note }}</span>
              <DocsLink topic="where-data-lives" section="Syncs" label="Learn about syncs" class="mt-1" />
            </template>
          </template>
        </FactList>
      </div>
    </section>

    <!-- Danger zone: the bucket deletion surface mounts here after merge.
         BucketDangerZone mounts here after merge -->
  </div>
</template>
