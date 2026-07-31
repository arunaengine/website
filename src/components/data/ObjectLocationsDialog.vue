<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { HardDrive, Server, ShieldAlert, TriangleAlert } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { copyState, scanLimitText } from '@/lib/storage'
import { ApiError, type BlobCopyResponse, type BlobLocationsResponse } from '@/lib/api'

const props = defineProps<{ open: boolean; bucket: string; objectKey: string; groupId: string | null }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { getBlobLocations } = useAruna()
const realmNodes = useRealmNodes()

const summary = ref<BlobLocationsResponse | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const missing = ref(false)

// Copies on a group backend live on infrastructure the tenant operates, so the
// node cannot vouch for their durability. That distinction is the point of
// this panel.
const onGroupBackend = computed(() =>
  (summary.value?.copies ?? []).some((copy) => copy.storage === 'group-backend' && copy.state === 'present'),
)
const storedCount = computed(
  () => (summary.value?.copies ?? []).filter((copy) => copy.state === 'present').length,
)

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  missing.value = false
  try {
    const response = await getBlobLocations(props.bucket, props.objectKey)
    if (seq !== loadSeq) return
    summary.value = response
  } catch (err) {
    if (seq !== loadSeq) return
    summary.value = null
    // 404 covers both an unknown object and a node that does not serve the
    // endpoint; neither claim can be made on its own, so say both.
    if (err instanceof ApiError && err.status === 404) missing.value = true
    else loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.open, props.bucket, props.objectKey],
  () => {
    if (props.open) void load()
    else summary.value = null
  },
  { immediate: true },
)

function nodeLabel(copy: BlobCopyResponse): string {
  return realmNodes.displayName(copy.node_id)
}

function stateVariant(state: string): 'success' | 'warn' | 'secondary' | 'outline' {
  if (state === 'present') return 'success'
  if (state === 'pending' || state === 'unreachable') return 'warn'
  if (state === 'not-stored') return 'secondary'
  return 'outline'
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <HardDrive class="h-4 w-4 text-primary" /> Storage locations
        </DialogTitle>
        <DialogDescription>
          Where the bytes of <span class="font-mono">{{ props.bucket }}/{{ props.objectKey }}</span>
          physically live.
        </DialogDescription>
      </DialogHeader>

      <Skeleton v-if="loading && !summary" class="h-24" />
      <p v-else-if="missing" class="text-xs text-muted-foreground">
        No copy record for this object. Either this node does not know it, or it does not report
        storage locations yet.
      </p>
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
      <template v-else-if="summary">
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>Version</span>
          <span class="font-mono text-foreground/80">{{ summary.version_id }}</span>
          <span>·</span>
          <span>{{ storedCount }} stored {{ storedCount === 1 ? 'copy' : 'copies' }}</span>
        </div>

        <ul class="space-y-1">
          <li
            v-for="copy in summary.copies"
            :key="`${copy.node_id}-${copy.group_backend_id ?? copy.storage_class ?? ''}`"
            class="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
          >
            <Server class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <RouterLink
              :to="{ name: 'status', query: { node: copy.node_id } }"
              class="text-xs font-medium text-primary hover:underline"
              :title="copy.node_id"
            >
              {{ nodeLabel(copy) }}
            </RouterLink>
            <Badge v-if="copy.local" variant="outline" class="text-[10px] uppercase">this node</Badge>
            <Badge :variant="stateVariant(copy.state)" class="text-[10px] uppercase" :title="copyState(copy.state).description">
              {{ copyState(copy.state).label }}
            </Badge>
            <span class="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
              <template v-if="copy.storage === 'group-backend'">
                Group backend
                <span class="font-mono text-foreground/80">{{ copy.group_backend_name || copy.group_backend_id }}</span>
              </template>
              <template v-else-if="copy.storage === 'node-managed'">
                Node storage<template v-if="copy.storage_class">, class
                  <span class="font-mono text-foreground/80">{{ copy.storage_class }}</span></template>
              </template>
              <template v-else>{{ copyState(copy.state).description }}</template>
            </span>
          </li>
          <li v-if="!summary.copies.length" class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No node reported a copy of this version.
          </li>
        </ul>

        <div
          v-if="onGroupBackend"
          class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A copy sits on storage your group operates, not on the node's own storage. Its
            durability, backups and availability are yours to guarantee; the node only writes and
            reads it.
            <RouterLink
              v-if="props.groupId"
              :to="{ name: 'groups', params: { id: props.groupId }, query: { tab: 'storage' } }"
              class="font-medium underline"
            >
              Manage storage backends
            </RouterLink>
          </span>
        </div>

        <div
          v-if="!summary.complete"
          class="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          <p class="flex items-start gap-2 text-foreground">
            <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>This list may be incomplete: a copy could exist that was not found.</span>
          </p>
          <p v-for="limit in summary.limits" :key="limit" class="pl-6">{{ scanLimitText(limit) }}</p>
        </div>

        <div class="flex justify-end">
          <Button variant="outline" size="sm" :disabled="loading" @click="load">Refresh</Button>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
