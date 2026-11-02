<script setup lang="ts">
// Which storage backend behind a node receives new uploads to this bucket. Each node keeps its own
// copy, so each node has its own rules; the group default is shown read-only above them.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BucketRoutingSection from '@/components/data/BucketRoutingSection.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { GroupBackendResponse, RoutingTarget } from '@/lib/api'
import { targetLabel } from '@/lib/storage'
import { Route } from '@lucide/vue'

// `nodeId`: the bucket's node, null for this one. `members`: the nodes of a distributed bucket.
const props = defineProps<{ bucket: string; groupId: string | null; nodeId?: string | null; members?: string[] | null }>()

const { getGroupRouting, listGroupBackends } = useAruna()
const realmNodes = useRealmNodes()

// The node whose rules are shown: one member of a distributed bucket at a time, else the bucket's node.
const chosen = ref('')
const choices = computed(() => (props.members ?? []).map((id) => ({ value: id, label: realmNodes.displayName(id) })))
watch(
  () => [props.members?.join(','), props.nodeId],
  () => {
    const members = props.members ?? []
    const preferred = members.find((id) => realmNodes.isLocalNode(id)) ?? members.find((id) => id === props.nodeId)
    chosen.value = members.includes(chosen.value) ? chosen.value : (preferred ?? members[0] ?? '')
  },
  { immediate: true },
)
const node = computed(() => {
  const id = props.members?.length ? chosen.value : props.nodeId
  return id && !realmNodes.isLocalNode(id) ? id : null
})
const groupTarget = ref<RoutingTarget | null>(null)
const backends = ref<GroupBackendResponse[]>([])
const loaded = ref(false)

// Only the answer for the group and node still shown is kept.
let groupRuns = 0
async function loadGroupDefault() {
  const run = ++groupRuns
  loaded.value = false
  groupTarget.value = null
  backends.value = []
  if (!props.groupId) {
    loaded.value = true
    return
  }
  await Promise.all([
    getGroupRouting(props.groupId, node.value)
      .then((response) => {
        if (run === groupRuns) groupTarget.value = response.default_target ?? null
      })
      .catch(() => undefined),
    listGroupBackends(props.groupId, node.value)
      .then((response) => {
        if (run === groupRuns) backends.value = response.backends
      })
      .catch(() => undefined),
  ])
  if (run === groupRuns) loaded.value = true
}

watch(() => [props.groupId, node.value], () => void loadGroupDefault(), { immediate: true })

const groupDefault = computed(() => targetLabel(groupTarget.value, backends.value))
</script>

<template>
  <div class="space-y-5">
    <section v-if="choices.length" class="surface space-y-2 px-5 py-4">
      <p class="text-xs text-muted-foreground">
        This bucket is stored on {{ choices.length }} nodes. Each node keeps its own copy, so each node has its own storage rules.
      </p>
      <Select v-model="chosen" :options="choices" aria-label="Node whose storage rules are shown" class="max-w-xs" />
    </section>
    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <Route class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Group default</h2>
      </header>
      <div class="px-5 py-4">
        <Skeleton v-if="!loaded" class="h-4 w-40" />
        <p v-else class="text-sm text-foreground">{{ groupDefault }}</p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Where new uploads go unless a rule below says otherwise.
          <RouterLink
            v-if="props.groupId"
            :to="{ name: 'group', params: { id: props.groupId }, query: { tab: 'storage' } }"
            class="font-medium text-primary hover:underline"
          >
            Change it on the group Storage tab
          </RouterLink>
          <DocsLink icon topic="where-data-lives" section="Storage backend" class="ml-0.5" />
        </p>
      </div>
    </section>

    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Rules for this bucket</h2>
      </header>
      <div class="px-5 py-4">
        <BucketRoutingSection open :bucket="props.bucket" :group-id="props.groupId" :node-id="node" />
      </div>
    </section>
  </div>
</template>
