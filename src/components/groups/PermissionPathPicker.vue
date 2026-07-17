<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Boxes, Globe, ListChecks, RefreshCw, ShieldCheck } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import MetaPathTree from './MetaPathTree.vue'
import DataPathTree from './DataPathTree.vue'
import { buildMetaPathTree, type MetaPathFolder } from './permission-paths'
import { useAruna } from '@/composables/useAruna'

const props = defineProps<{
  groupId: string
  // Group scope prefix (/{realm}/g/{group}/) forwarded to the data/ tree so it
  // can derive role-path suffixes from the served permission paths.
  pathPrefix: string
  selected?: string
}>()

const emit = defineEmits<{ (e: 'select', suffix: string): void }>()

const { listGroupMetadata } = useAruna()

// The three well-known scopes plus the whole group; the meta/ and data/ trees
// below narrow those coarse scopes to a folder subtree or a single entry.
const SCOPES = [
  { suffix: '**', title: 'Everything', icon: Globe, hint: 'All metadata, data and admin operations in this group.' },
  { suffix: 'meta/**', title: 'Metadata', icon: ListChecks, hint: 'All RO-Crate metadata documents. Browse below to narrow the scope.' },
  { suffix: 'data/**', title: 'Data', icon: Boxes, hint: 'All objects on this node. Browse below to narrow to a bucket or object.' },
  { suffix: 'admin/**', title: 'Administration', icon: ShieldCheck, hint: 'Group settings, roles and membership.' },
]

const loading = ref(false)
const loadError = ref<string | null>(null)
const tree = ref<MetaPathFolder | null>(null)
const expanded = ref(new Set<string>())

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const response = await listGroupMetadata(props.groupId)
    tree.value = buildMetaPathTree(response.documents.map((doc) => doc.document_path))
    // Open the first level so the tree reads as a browser, not a blank box.
    expanded.value = new Set(tree.value.folders.map((folder) => folder.path))
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

function toggle(path: string) {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
}

onMounted(() => void load())
</script>

<template>
  <div class="rounded-lg border border-border bg-background p-3">
    <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resource scopes</div>
    <ul class="mt-1.5 space-y-0.5">
      <li v-for="scope in SCOPES" :key="scope.suffix">
        <button
          type="button"
          :class="[
            'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted',
            selected === scope.suffix ? 'bg-primary/[0.08]' : '',
          ]"
          @click="emit('select', scope.suffix)"
        >
          <component :is="scope.icon" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span class="min-w-0">
            <span class="text-xs font-medium text-foreground">{{ scope.title }}</span>
            <span class="ml-1.5 font-mono text-[10px] text-muted-foreground">{{ scope.suffix }}</span>
            <span class="block text-[11px] leading-snug text-muted-foreground">{{ scope.hint }}</span>
          </span>
        </button>
      </li>
    </ul>

    <div class="mt-3 flex items-center justify-between">
      <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Metadata documents</div>
      <Button variant="ghost" size="sm" class="h-6 px-1.5 text-[10px]" :disabled="loading" @click="load">
        <RefreshCw class="h-3 w-3" :class="loading ? 'animate-spin' : ''" /> Reload
      </Button>
    </div>
    <p class="mt-0.5 text-[11px] text-muted-foreground">
      Pick a folder to cover its whole subtree, or a single document for exactly one entry.
    </p>
    <div class="mt-1.5">
      <div v-if="loading && !tree" class="space-y-1.5">
        <Skeleton class="h-5" />
        <Skeleton class="h-5" />
      </div>
      <p v-else-if="loadError" class="text-xs text-destructive">{{ loadError }}</p>
      <p v-else-if="tree && !tree.folders.length && !tree.documents.length" class="text-xs text-muted-foreground">
        This group has no metadata documents yet; use a scope above.
      </p>
      <MetaPathTree v-else-if="tree" :node="tree" :expanded="expanded" @toggle="toggle" @select="emit('select', $event)" />
    </div>

    <div class="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data objects</div>
    <p class="mt-0.5 text-[11px] text-muted-foreground">
      Expand a bucket to a folder or object; pick a folder for its subtree, or an object for exactly one key.
    </p>
    <div class="mt-1.5">
      <DataPathTree :group-id="groupId" :path-prefix="pathPrefix" :selected="selected" @select="emit('select', $event)" />
    </div>
  </div>
</template>
