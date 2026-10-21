<script setup lang="ts">
// Step 3 of Organize: tidy the storage. Each row has a preview and an action that works without it.
import { computed, ref, watch } from 'vue'
import PagedList from '@/components/storage/PagedList.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  PAGE_SIZE,
  previewDuplicates,
  startDuplicates,
  startImportRenames,
  type BackendImport,
  type BackendImportRenames,
  type DuplicatePreview,
} from '@/lib/api'
import { filesWord } from '@/lib/organize'
import { moveRefusal } from '@/lib/storageRules'
import { errorMessage, formatBytes } from '@/lib/utils'

const props = defineProps<{
  groupId: string
  link: BackendImport
  /** Files still named by an earlier pattern; null when the node cannot say. */
  renames: BackendImportRenames | null
  /** A step is running, so no second one starts. */
  blocked?: boolean
}>()
const emit = defineEmits<{ (e: 'started'): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

const copies = ref<DuplicatePreview | null>(null)
const copyOffset = ref(0)
const copyFilter = ref('')
const showCopies = ref(false)
const showRenames = ref(false)
const renameOffset = ref(0)
const renameFilter = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
let requestId = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const renameCount = computed(() => props.renames?.count ?? 0)
const renameOffered = computed(() => Boolean(props.renames && (props.renames.count > 0 || !props.renames.complete)))
const renameRows = computed(() => {
  const text = renameFilter.value.toLowerCase()
  return (props.renames?.files ?? []).filter((file) => file.from.toLowerCase().includes(text))
})
const renamePage = computed(() => renameRows.value.slice(renameOffset.value, renameOffset.value + PAGE_SIZE))
const idle = computed(() => !renameOffered.value && !copies.value?.total)

async function loadCopies(offset = 0, filter = copyFilter.value) {
  const id = ++requestId
  try {
    const page = await previewDuplicates(
      props.groupId,
      props.link.import_id,
      { offset, limit: PAGE_SIZE, filter },
      client(),
    )
    if (id !== requestId) return
    copies.value = page
    copyOffset.value = offset
    copyFilter.value = filter
  } catch (err) {
    if (id !== requestId) return
    copies.value = null
    if (!isUnsupportedEndpoint(err)) error.value = errorMessage(err)
  }
}

watch(
  () => [props.link.import_id, sessionEpoch.value],
  () => {
    copies.value = null
    showCopies.value = false
    showRenames.value = false
    error.value = null
    void loadCopies(0, '')
  },
  { immediate: true },
)

async function act(run: () => Promise<unknown>) {
  if (busy.value || props.blocked || writesDisabled.value) return
  busy.value = true
  error.value = null
  const epoch = sessionEpoch.value
  try {
    await run()
    if (epoch === sessionEpoch.value) emit('started')
  } catch (err) {
    if (epoch === sessionEpoch.value) error.value = moveRefusal(err) ?? errorMessage(err)
  } finally {
    busy.value = false
  }
}

const rename = () => act(() => startImportRenames(props.groupId, props.link.import_id, client()))
const removeCopies = () => act(() => startDuplicates(props.groupId, props.link.import_id, client()))
const offlineHint = computed(() => (writesDisabled.value ? OFFLINE_WRITE_HINT : undefined))
</script>

<template>
  <div class="space-y-3">
    <p v-if="idle" class="text-xs text-muted-foreground">Nothing to tidy.</p>

    <div v-if="renameOffered && renames" class="space-y-2" data-testid="rename-row">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-sm">
            <template v-if="renameCount">{{ renames.complete ? '' : 'At least ' }}{{ filesWord(renameCount) }} still {{ renameCount === 1 ? 'has' : 'have' }} the old name</template>
            <template v-else>Some files may still have the old name</template>
          </p>
          <p class="text-xs text-muted-foreground">They get the new name. Each gets a copy first, then the old file is removed.</p>
        </div>
        <Button v-if="renames.files.length" variant="outline" size="sm" @click="showRenames = !showRenames">
          {{ showRenames ? 'Hide preview' : 'Preview' }}
        </Button>
        <Button size="sm" :disabled="busy || blocked || writesDisabled" :title="offlineHint" @click="rename">
          {{ renameCount ? `Rename ${filesWord(renameCount)}` : 'Rename files' }}
        </Button>
      </div>
      <PagedList
        v-if="showRenames"
        :total="renameRows.length"
        :offset="renameOffset"
        :shown="renamePage.length"
        :filter="renameFilter"
        @page="(value: number) => (renameOffset = value)"
        @filter="(value: string) => ((renameFilter = value), (renameOffset = 0))"
      >
        <li v-for="file in renamePage" :key="file.from" class="flex items-center gap-2 px-3 py-1.5 font-mono">
          <span class="min-w-0 flex-1 truncate" :title="file.from">{{ file.from }}</span>
          <span class="shrink-0 font-sans text-muted-foreground">→</span>
          <span class="min-w-0 flex-1 truncate" :title="file.to">{{ file.to }}</span>
        </li>
      </PagedList>
    </div>

    <div v-if="copies && copies.total" class="space-y-2" data-testid="copies-row">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-sm">{{ filesWord(copies.total) }} {{ copies.total === 1 ? 'is' : 'are' }} stored twice · {{ formatBytes(copies.bytes) }}</p>
          <p class="text-xs text-muted-foreground">Same name, same content. One copy stays; all versions keep working.</p>
        </div>
        <Button variant="outline" size="sm" @click="showCopies = !showCopies">
          {{ showCopies ? 'Hide preview' : 'Preview' }}
        </Button>
        <Button size="sm" :disabled="busy || blocked || writesDisabled" :title="offlineHint" @click="removeCopies">
          Remove {{ copies.total === 1 ? '1 copy' : `${copies.total} copies` }}
        </Button>
      </div>
      <PagedList
        v-if="showCopies"
        :total="copies.total"
        :offset="copyOffset"
        :shown="copies.items.length"
        :filter="copyFilter"
        @page="(value: number) => loadCopies(value)"
        @filter="(value: string) => loadCopies(0, value)"
      >
        <li v-for="item in copies.items" :key="item.removed" class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5">
          <span class="truncate font-mono" :title="item.kept">{{ item.kept }}</span>
          <span class="text-muted-foreground">keeps</span>
          <span class="truncate font-mono text-muted-foreground" :title="item.removed">removes {{ item.removed }}</span>
        </li>
      </PagedList>
    </div>

    <p class="text-[11px] text-muted-foreground">A file is only removed after its copy is checked and nothing else uses it.</p>
    <Notice v-if="error" tone="error">{{ error }}</Notice>
  </div>
</template>
