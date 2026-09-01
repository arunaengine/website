<script setup lang="ts">
// Which storage backend behind this node receives new uploads to this bucket.
// The group default is shown read-only above the rules that override it.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BucketRoutingSection from '@/components/data/BucketRoutingSection.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import type { GroupBackendResponse, RoutingTarget } from '@/lib/api'
import { targetLabel } from '@/lib/storage'
import { Route } from '@lucide/vue'

const props = defineProps<{ bucket: string; groupId: string | null }>()

const { getGroupRouting, listGroupBackends } = useAruna()
const groupTarget = ref<RoutingTarget | null>(null)
const backends = ref<GroupBackendResponse[]>([])
const loaded = ref(false)

async function loadGroupDefault() {
  loaded.value = false
  groupTarget.value = null
  backends.value = []
  if (!props.groupId) {
    loaded.value = true
    return
  }
  await Promise.all([
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
  ])
  loaded.value = true
}

watch(() => props.groupId, () => void loadGroupDefault(), { immediate: true })

const groupDefault = computed(() => targetLabel(groupTarget.value, backends.value))
</script>

<template>
  <div class="space-y-5">
    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <Route class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Group default</h2>
      </header>
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div class="min-w-0">
          <Skeleton v-if="!loaded" class="h-4 w-40" />
          <p v-else class="text-sm text-foreground">
            New uploads go to {{ groupDefault }} when no rule below says otherwise.
          </p>
          <p class="mt-0.5 text-[11px] text-muted-foreground">
            The default belongs to the group, not to this bucket.
          </p>
        </div>
        <RouterLink
          v-if="props.groupId"
          :to="{ name: 'group', params: { id: props.groupId }, query: { tab: 'storage' } }"
          class="text-xs font-medium text-primary hover:underline"
        >
          Open the group Storage tab
        </RouterLink>
      </div>
    </section>

    <section class="surface">
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Rules for this bucket</h2>
        <DocsLink topic="where-data-lives" section="Storage backend" label="Learn how a rule is picked" />
      </header>
      <div class="px-5 py-4">
        <BucketRoutingSection open :bucket="props.bucket" :group-id="props.groupId" />
      </div>
    </section>
  </div>
</template>
