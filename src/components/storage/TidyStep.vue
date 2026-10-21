<script setup lang="ts">
// Step 3 of Organize: tidy the storage. Each row has a preview and an action that works without it.
import { computed, ref, watch } from 'vue'
import PagedList from '@/components/storage/PagedList.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { useCursorPage } from '@/composables/useCursorPage'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  getImportRenames,
  previewDuplicates,
  startDuplicates,
  startImportRenames,
  type BackendImport,
  type BackendImportRenames,
  type DuplicateItem,
} from '@/lib/api'
import { filesWord, organizeError } from '@/lib/organize'
import { moveRefusal } from '@/lib/storageRules'
import { formatBytes } from '@/lib/utils'

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

const showCopies = ref(false)
const showRenames = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const copies = useCursorPage<DuplicateItem>((query) =>
  previewDuplicates(props.groupId, props.link.import_id, query, client()),
)
const oldNames = useCursorPage<{ from: string; to: string; writable?: boolean }>(async (query) => {
  const found = await getImportRenames(props.groupId, props.link.import_id, client(), query)
  return { items: found.files, total: found.count, complete: found.complete, next: found.next }
})

const copyTotal = computed(() => copies.page.value?.total ?? 0)
const copyBytes = computed(() => (copies.page.value as { bytes?: number } | null)?.bytes ?? 0)
const copyComplete = computed(() => copies.page.value?.complete ?? true)
const renameCount = computed(() => props.renames?.count ?? 0)
const renameOffered = computed(() => Boolean(props.renames && (props.renames.count > 0 || !props.renames.complete)))
const idle = computed(() => !renameOffered.value && !copyTotal.value)

watch(
  () => [props.link.import_id, sessionEpoch.value],
  () => {
    copies.reset()
    oldNames.reset()
    showCopies.value = false
    showRenames.value = false
    error.value = null
    void copies.load('')
  },
  { immediate: true },
)

function toggleRenames() {
  showRenames.value = !showRenames.value
  if (showRenames.value && !oldNames.page.value) void oldNames.load('')
}

async function act(run: () => Promise<unknown>) {
  if (busy.value || props.blocked || writesDisabled.value) return
  busy.value = true
  error.value = null
  const epoch = sessionEpoch.value
  try {
    await run()
    if (epoch === sessionEpoch.value) emit('started')
  } catch (err) {
    if (epoch !== sessionEpoch.value) return
    error.value = isUnsupportedEndpoint(err) ? 'This node cannot do this yet.' : (moveRefusal(err) ?? organizeError(err))
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
        <Button variant="outline" size="sm" @click="toggleRenames">
          {{ showRenames ? 'Hide preview' : 'Preview' }}
        </Button>
        <Button size="sm" :disabled="busy || blocked || writesDisabled" :title="offlineHint" @click="rename">
          {{ renameCount ? `Rename ${filesWord(renameCount)}` : 'Rename files' }}
        </Button>
      </div>
      <PagedList
        v-if="showRenames"
        :total="oldNames.page.value?.total ?? 0"
        :complete="oldNames.page.value?.complete ?? true"
        :offset="oldNames.offset.value"
        :shown="oldNames.items.value.length"
        :filter="oldNames.filter.value"
        :busy="oldNames.busy.value"
        :has-next="oldNames.hasNext.value"
        :has-prev="oldNames.hasPrev.value"
        @next="oldNames.next()"
        @prev="oldNames.prev()"
        @filter="(value: string) => oldNames.load(value)"
      >
        <li v-for="file in oldNames.items.value" :key="file.from" class="flex items-center gap-2 px-3 py-1.5 font-mono">
          <span class="min-w-0 flex-1 truncate" :title="file.from">{{ file.from }}</span>
          <span class="shrink-0 font-sans text-muted-foreground">→</span>
          <span class="min-w-0 flex-1 truncate" :title="file.to">{{ file.to }}</span>
          <span v-if="file.writable === false" class="shrink-0 font-sans text-[11px] text-muted-foreground">cannot rename</span>
        </li>
      </PagedList>
    </div>

    <div v-if="copyTotal" class="space-y-2" data-testid="copies-row">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-sm">
            {{ copyComplete ? '' : 'At least ' }}{{ filesWord(copyTotal) }} {{ copyTotal === 1 ? 'is' : 'are' }} stored twice · {{ formatBytes(copyBytes) }}
          </p>
          <p class="text-xs text-muted-foreground">Same name, same content. One copy stays; all versions keep working.</p>
        </div>
        <Button variant="outline" size="sm" @click="showCopies = !showCopies">
          {{ showCopies ? 'Hide preview' : 'Preview' }}
        </Button>
        <Button size="sm" :disabled="busy || blocked || writesDisabled" :title="offlineHint" @click="removeCopies">
          Remove {{ copyTotal === 1 ? '1 copy' : `${copyTotal} copies` }}
        </Button>
      </div>
      <PagedList
        v-if="showCopies"
        :total="copyTotal"
        :complete="copyComplete"
        :offset="copies.offset.value"
        :shown="copies.items.value.length"
        :filter="copies.filter.value"
        :busy="copies.busy.value"
        :has-next="copies.hasNext.value"
        :has-prev="copies.hasPrev.value"
        @next="copies.next()"
        @prev="copies.prev()"
        @filter="(value: string) => copies.load(value)"
      >
        <li v-for="item in copies.items.value" :key="item.key" class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5">
          <span class="truncate font-mono" :title="item.kept.path">{{ item.kept.path }}</span>
          <span class="text-muted-foreground">keeps</span>
          <span class="truncate font-mono text-muted-foreground" :title="item.removed.map((file) => file.path).join(', ')">
            removes {{ item.removed.map((file) => file.path).join(', ') }}
          </span>
        </li>
      </PagedList>
    </div>

    <p class="text-[11px] text-muted-foreground">A file is only removed after its copy is checked and nothing else uses it.</p>
    <Notice v-if="error || copies.error.value || oldNames.error.value" tone="error">{{ error ?? copies.error.value ?? oldNames.error.value }}</Notice>
  </div>
</template>
