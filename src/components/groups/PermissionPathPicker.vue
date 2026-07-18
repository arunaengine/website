<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Boxes, Globe, Layers, ListChecks, RefreshCw, ShieldCheck, SlidersHorizontal } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import MetaPathTree from './MetaPathTree.vue'
import DataPathTree from './DataPathTree.vue'
import { buildMetaPathTree, shortNodeId, type MetaPathFolder } from './permission-paths'
import { useAruna } from '@/composables/useAruna'

const props = defineProps<{
  groupId: string
  // Group scope prefix (/{realm}/g/{group}/) forwarded to the data/ tree so it
  // can derive role-path suffixes from the served permission paths.
  pathPrefix: string
  selected?: string[]
}>()

// A selection is one or more role-path suffixes; "Data & metadata" is the only
// scope that emits two (meta/** and data/** are siblings, ** would add admin).
const emit = defineEmits<{ (e: 'select', suffixes: string[]): void }>()

const { listGroupMetadata, realmInfo, nodeInfo } = useAruna()

const SCOPES = [
  { key: 'all', title: 'Everything', icon: Globe, suffixes: ['**'], hint: 'Files, metadata and group administration, the whole group.' },
  { key: 'data-meta', title: 'Data & metadata', icon: Layers, suffixes: ['meta/**', 'data/**'], hint: 'All files and all metadata documents, but no group administration.' },
  { key: 'meta', title: 'Metadata', icon: ListChecks, suffixes: ['meta/**'], hint: 'All metadata documents. Browse below to narrow this down.' },
  { key: 'data', title: 'Data', icon: Boxes, suffixes: ['data/**'], hint: 'All files on every node. Pick a node below to narrow this down.' },
  { key: 'admin', title: 'Administration', icon: ShieldCheck, suffixes: ['admin/**'], hint: 'Group settings, roles and members.' },
]

function isActive(suffixes: string[]): boolean {
  const current = props.selected ?? []
  return current.length === suffixes.length && suffixes.every((suffix) => current.includes(suffix))
}

const activeScope = computed(() => SCOPES.find((scope) => isActive(scope.suffixes)) ?? null)

// Progressive disclosure: quick scopes only by default; the detail browsers
// appear behind the "Custom…" pill, one at a time (data or metadata).
const customOpen = ref(false)
const customMode = ref<'data' | 'meta'>('data')
const customActive = computed(
  () => customOpen.value || (!!props.selected?.length && !activeScope.value),
)

function selectScope(suffixes: string[]) {
  customOpen.value = false
  emit('select', suffixes)
}

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

// Data paths are node-scoped (data/{node}/…); the portal can only browse the
// node it is connected to, other nodes get a typed-path fallback.
const localNodeId = computed(() => nodeInfo.value?.node.peer_id ?? '')
const realmNodes = computed(() => realmInfo.value?.nodes ?? [])
const nodeOptions = computed(() => [
  { value: 'all', label: 'All nodes' },
  ...realmNodes.value.map((node) => ({
    value: node.node_id,
    label: `${node.kind} ${shortNodeId(node.node_id)}${node.node_id === localNodeId.value ? ' (this portal)' : ''}`,
  })),
])
const nodeOverride = ref<string | null>(null)
const nodeChoice = computed(() => {
  if (nodeOverride.value) return nodeOverride.value
  return realmNodes.value.some((node) => node.node_id === localNodeId.value) ? localNodeId.value : 'all'
})
const browsableNode = computed(() => nodeChoice.value === localNodeId.value && !!localNodeId.value)

const allDataSuffix = computed(() =>
  nodeChoice.value === 'all' ? 'data/**' : `data/${nodeChoice.value}/**`,
)

const typedFolder = ref('')
function selectTyped() {
  const cleaned = typedFolder.value.trim().replace(/^\/+|\/+$/g, '')
  if (!cleaned) return
  emit('select', [`data/${nodeChoice.value}/${cleaned}/**`])
}

// The metadata tree is only fetched once the metadata browser is revealed.
watch(
  () => customOpen.value && customMode.value === 'meta',
  (visible) => {
    if (visible && !tree.value && !loading.value) void load()
  },
)
</script>

<template>
  <div>
    <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick scopes</div>
    <div class="mt-1.5 flex flex-wrap gap-1.5">
      <button
        v-for="scope in SCOPES"
        :key="scope.key"
        type="button"
        :class="[
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
          isActive(scope.suffixes)
            ? 'border-primary/50 bg-primary/[0.08] text-foreground'
            : 'border-border text-foreground/80 hover:bg-muted',
        ]"
        :title="`${scope.hint} (${scope.suffixes.join(' + ')})`"
        @click="selectScope(scope.suffixes)"
      >
        <component :is="scope.icon" class="h-3.5 w-3.5 text-primary" />
        {{ scope.title }}
      </button>
      <button
        type="button"
        :class="[
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
          customActive
            ? 'border-primary/50 bg-primary/[0.08] text-foreground'
            : 'border-border text-foreground/80 hover:bg-muted',
        ]"
        title="Browse for a specific folder, document or file"
        @click="customOpen = !customOpen"
      >
        <SlidersHorizontal class="h-3.5 w-3.5 text-primary" />
        Custom…
      </button>
    </div>
    <p class="mt-1.5 text-[11px] text-muted-foreground">
      {{ activeScope ? activeScope.hint : customOpen ? 'Browse below and pick exactly what this rule covers.' : 'Pick a quick scope, or choose Custom… for something more specific.' }}
    </p>

    <div v-if="customOpen" class="mt-3">
      <div class="inline-flex rounded-md border border-border p-0.5">
        <button
          type="button"
          :class="[
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            customMode === 'data' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="customMode = 'data'"
        >
          Data
        </button>
        <button
          type="button"
          :class="[
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            customMode === 'meta' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="customMode = 'meta'"
        >
          Metadata
        </button>
      </div>

      <section v-if="customMode === 'meta'" class="mt-2 rounded-lg border border-border bg-background">
        <div class="flex items-center justify-between border-b border-border/70 px-3 py-2">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Metadata documents</div>
          <Button variant="ghost" size="sm" class="h-6 px-1.5 text-[10px]" :disabled="loading" @click="load">
            <RefreshCw class="h-3 w-3" :class="loading ? 'animate-spin' : ''" /> Reload
          </Button>
        </div>
        <div class="px-3 pb-3 pt-2">
          <p class="text-[11px] text-muted-foreground">
            Choose a folder to include everything inside it, or a single document.
          </p>
          <div class="scrollbar-thin mt-1.5 max-h-80 min-h-28 overflow-y-auto">
            <div v-if="loading && !tree" class="space-y-1.5">
              <Skeleton class="h-5" />
              <Skeleton class="h-5" />
            </div>
            <p v-else-if="loadError" class="text-xs text-destructive">{{ loadError }}</p>
            <p v-else-if="tree && !tree.folders.length && !tree.documents.length" class="text-xs text-muted-foreground">
              This group has no metadata documents yet; use a quick scope above.
            </p>
            <MetaPathTree
              v-else-if="tree"
              :node="tree"
              :expanded="expanded"
              :selected="selected"
              @toggle="toggle"
              @select="emit('select', [$event])"
            />
          </div>
        </div>
      </section>

      <section v-else class="mt-2 rounded-lg border border-border bg-background">
        <div class="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Files</div>
          <div class="flex min-w-0 items-center gap-1.5">
            <span class="shrink-0 text-[11px] text-muted-foreground">Node</span>
            <Select
              :model-value="nodeChoice"
              :options="nodeOptions"
              aria-label="Node"
              class="h-7 max-w-52 text-xs"
              @update:model-value="(value: string) => (nodeOverride = value)"
            />
          </div>
        </div>
        <div class="px-3 pb-3 pt-2">
          <button
            type="button"
            :class="[
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
              isActive([allDataSuffix]) ? 'bg-primary/[0.08]' : '',
            ]"
            :title="`Everything under ${allDataSuffix}`"
            @click="emit('select', [allDataSuffix])"
          >
            <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
            <span class="font-medium text-foreground">
              {{ nodeChoice === 'all' ? 'All files on every node' : 'All files on this node' }}
            </span>
          </button>
          <template v-if="browsableNode">
            <p class="mt-1 text-[11px] text-muted-foreground">
              Open a bucket and choose a folder to include everything inside it, or a single file.
            </p>
            <div class="scrollbar-thin mt-1.5 max-h-80 min-h-24 overflow-y-auto">
              <DataPathTree
                :group-id="groupId"
                :path-prefix="pathPrefix"
                :selected="selected"
                @select="emit('select', [$event])"
              />
            </div>
          </template>
          <p v-else-if="nodeChoice === 'all'" class="mt-1 text-[11px] text-muted-foreground">
            Pick a specific node to narrow the scope; folders can be browsed on the node this portal is connected to.
          </p>
          <template v-else>
            <p class="mt-1 text-[11px] text-muted-foreground">
              This portal can only browse folders on its own node, type a bucket or folder path instead.
            </p>
            <div class="mt-1.5 flex items-center gap-2">
              <Input
                v-model="typedFolder"
                class="h-8 text-xs"
                placeholder="bucket or bucket/folder"
                @keydown.enter.prevent="selectTyped"
              />
              <Button variant="outline" size="sm" class="shrink-0" :disabled="!typedFolder.trim()" @click="selectTyped">
                Select folder
              </Button>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>
