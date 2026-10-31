<script setup lang="ts">
// The Notebooks tab of Compute: the notebooks in the group's buckets, each opening the notebook
// view directly, with Open notebook (the picker) and New notebook (a folder, then a name).
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import ListShell from '@/components/ui/ListShell.vue'
import Pagination from '@/components/ui/Pagination.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import KindTile from '@/components/compute/KindTile.vue'
import NewNotebookDialog from '@/components/notebook/NewNotebookDialog.vue'
import NotebookPicker from '@/components/notebook/NotebookPicker.vue'
import { useNotebookFinder } from '@/composables/useNotebookFinder'
import { activeGroupId } from '@/composables/useGroupSelection'
import { folderOf } from '@/lib/notebook/finder'
import { formatBytes, formatDateTime } from '@/lib/utils'
import { FolderOpen, NotebookPen, Plus } from '@lucide/vue'

const props = defineProps<{ refreshRevision?: number; startNew?: boolean }>()
const emit = defineEmits<{ (e: 'started'): void }>()

const finder = useNotebookFinder()
onMounted(() => void finder.load())
watch(() => props.refreshRevision, () => void finder.load())

const PAGE = 10
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(finder.notebooks.value.length / PAGE)))
watch(pages, (count) => { if (page.value > count) page.value = count })
const shown = computed(() => finder.notebooks.value.slice((page.value - 1) * PAGE, page.value * PAGE))
const range = computed(() => {
  const total = finder.notebooks.value.length
  return `${(page.value - 1) * PAGE + 1}-${Math.min(page.value * PAGE, total)} of ${total}`
})

const shellState = computed(() => {
  if (finder.state.value === 'error') return 'error'
  if (finder.state.value !== 'ready') return 'loading'
  return finder.notebooks.value.length ? 'ready' : 'empty'
})

const picking = ref(false)
const choosing = ref(false)
const naming = ref(false)
const target = ref<{ bucket: string; prefix: string; nodeId: string | null }>({ bucket: '', prefix: '', nodeId: null })
function chosen(value: { bucket: string; prefix: string; nodeId: string | null }) {
  target.value = value
  naming.value = true
}
function startNew() {
  choosing.value = true
  emit('started')
}
watch(() => props.startNew, (start) => { if (start) startNew() }, { immediate: true })

const nameOf = (key: string) => key.slice(folderOf(key).length)
</script>

<template>
  <section>
    <SectionHeading title="Notebooks" :icon="NotebookPen" info="Notebooks are files in your buckets. A kernel runs the notebook on a node.">
      <template #actions>
        <Button variant="outline" size="sm" @click="picking = true"><FolderOpen class="h-3.5 w-3.5" /> Open notebook</Button>
        <Button variant="outline" size="sm" @click="startNew"><Plus class="h-3.5 w-3.5" /> New notebook</Button>
      </template>
    </SectionHeading>

    <ListShell
      :state="shellState"
      :error="finder.error.value || 'The notebooks could not be found.'"
      empty-title="No notebooks yet"
      empty-description="Create one, or open a notebook from a bucket of another group."
      @retry="finder.load"
    >
      <template #empty-actions>
        <Button variant="outline" size="sm" @click="startNew"><Plus class="h-3.5 w-3.5" /> New notebook</Button>
      </template>
      <div class="overflow-x-auto">
        <table class="data-table data-table-tall">
          <thead>
            <tr>
              <th class="hidden w-12 pl-5 pr-0 sm:table-cell"><span class="sr-only">Type</span></th>
              <th class="pl-5">Notebook</th>
              <th class="hidden md:table-cell">Bucket</th>
              <th class="num hidden sm:table-cell">Size</th>
              <th class="hidden text-right sm:table-cell">Last saved</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in shown" :key="`${entry.bucket}/${entry.key}`">
              <td class="hidden w-12 pl-5 pr-0 sm:table-cell"><KindTile :icon="NotebookPen" tone="aqua" label="Notebook" /></td>
              <td class="w-full max-w-0 pl-5">
                <RouterLink
                  :to="{ name: 'notebook', params: { bucketId: entry.bucket, key: entry.key }, query: { group: activeGroupId, node: entry.nodeId ?? undefined } }"
                  class="block truncate font-medium text-foreground hover:underline"
                >{{ nameOf(entry.key) }}</RouterLink>
                <p class="mt-1 truncate font-mono text-xs text-muted-foreground" :title="`${entry.bucket}/${entry.key}`">
                  {{ folderOf(entry.key) || '/' }}
                </p>
              </td>
              <td class="hidden whitespace-nowrap text-[13px] md:table-cell">{{ entry.bucket }}</td>
              <td class="num hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">{{ entry.size !== undefined ? formatBytes(entry.size) : '-' }}</td>
              <td class="hidden whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                {{ entry.lastModified ? formatDateTime(entry.lastModified) : '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
          <span>{{ finder.notebooks.value.length > PAGE ? range : `${finder.notebooks.value.length} ${finder.notebooks.value.length === 1 ? 'notebook' : 'notebooks'}` }}</span>
          <Pagination v-if="pages > 1" :page="page" :page-count="pages" :has-next="page < pages" @update:page="(next: number) => (page = next)" />
        </div>
      </template>
    </ListShell>
    <p v-if="finder.partial.value.length" class="mt-2 text-xs text-muted-foreground">
      Searched only in part: {{ finder.partial.value.join(', ') }}
    </p>
    <p v-if="finder.failed.value.length" class="mt-2 text-xs text-muted-foreground">Could not be searched: {{ finder.failed.value.join(', ') }}</p>

    <NotebookPicker v-model:open="picking" :finder="finder" />
    <NotebookPicker v-model:open="choosing" mode="new" :finder="finder" @chosen="chosen" />
    <NewNotebookDialog v-model:open="naming" :bucket="target.bucket" :prefix="target.prefix" :node-id="target.nodeId" :group-id="activeGroupId" />
  </section>
</template>
