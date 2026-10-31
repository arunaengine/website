<script setup lang="ts">
// The dataset's persistent ID with its state, as one About row; Details explains the state.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import { useAruna } from '@/composables/useAruna'
import { graphIriFor } from '@/lib/graphIri'
import { listPersistentIds, pidStateMeta, type PersistentIdView } from '@/lib/pid'

const props = defineProps<{ documentId: string }>()
const { apiBaseUrl, authToken, sessionEpoch } = useAruna()

const view = ref<PersistentIdView | null>(null)
const read = ref(false)
let run = 0
watch([() => props.documentId, sessionEpoch], async ([id]) => {
  const mine = ++run
  view.value = null
  read.value = false
  if (!id) return
  const answer = await listPersistentIds(id, { baseUrl: apiBaseUrl.value, token: authToken.value }).catch(() => null)
  if (mine !== run) return
  view.value = answer?.[0] ?? null
  read.value = true
}, { immediate: true })

const pid = computed(() => view.value?.value ?? graphIriFor(props.documentId))
const meta = computed(() => pidStateMeta(view.value?.state ?? 'unknown'))
</script>

<template>
  <dt class="text-muted-foreground">Persistent ID</dt>
  <dd class="flex min-w-0 flex-wrap items-center gap-2">
    <code class="min-w-0 truncate font-mono text-xs" :title="pid">{{ pid }}</code>
    <CopyButton :value="pid" label="Copy persistent ID" />
    <Badge v-if="read" :variant="meta.variant">{{ meta.label }}</Badge>
  </dd>
</template>
