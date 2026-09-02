<script setup lang="ts">
// What a bucket reader needs in one look. The rules the bucket carries sit in
// one card, what this node observed in another, and every observed line names
// the node it came from. Nothing here invents a number the backend cannot give.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import DocsLink from '@/components/ui/DocsLink.vue'
import FactList from '@/components/ui/FactList.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BucketDangerZone from '@/components/data/BucketDangerZone.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketSyncs } from '@/composables/useBucketSyncs'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { ApiError, type GroupBackendResponse, type RoutingTarget, type StorageRoutingRule } from '@/lib/api'
import type { DeletionResult } from '@/lib/deletion/request'
import type { PolicyRefBody } from '@/lib/placementPolicies'
import { targetLabel } from '@/lib/storage'
import { HardDrive, ShieldCheck, Trash2 } from '@lucide/vue'

const props = defineProps<{ bucket: string; groupId: string | null; nodeId: string | null }>()
const emit = defineEmits<{ (e: 'deleted', result: DeletionResult): void }>()

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

const REMOTE = { value: 'Unknown here', note: 'This bucket is hosted on another node.' }
const NO_ANSWER = { value: 'Unknown', note: 'This node did not answer.' }

const backend = computed(() => {
  if (remote.value) return REMOTE
  if (routingState.value === 'loading') return null
  if (routingState.value === 'refused') {
    return { value: 'Not shown', note: 'Only admins of the owning group may read it.' }
  }
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

const ruleFacts = computed(() => [
  { key: 'backend', label: 'Storage backend', value: backend.value?.value ?? '' },
  { key: 'policies', label: 'Placement policies', value: policySummary.value?.value ?? '' },
])
const observedFacts = computed(() => [
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
    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <ShieldCheck class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Rules this bucket carries</h2>
      </header>
      <div class="px-5 py-4">
        <FactList :items="ruleFacts" class="sm:grid-cols-1">
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
        </FactList>
      </div>
    </section>

    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <HardDrive class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Observed on this node</h2>
      </header>
      <div class="px-5 py-4">
        <FactList :items="observedFacts" class="sm:grid-cols-1">
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
        </FactList>
      </div>
    </section>

    <section class="surface lg:col-span-2">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <Trash2 class="size-4 text-destructive" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Danger zone</h2>
      </header>
      <div class="space-y-3 px-5 py-4">
        <p class="text-xs text-muted-foreground">
          Deleting the bucket removes every object, version and delete marker it holds on this node,
          and nothing brings them back.
        </p>
        <BucketDangerZone
          :bucket="props.bucket"
          :node-id="props.nodeId"
          @deleted="(result: DeletionResult) => emit('deleted', result)"
        />
      </div>
    </section>
  </div>
</template>
