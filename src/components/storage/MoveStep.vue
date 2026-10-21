<script setup lang="ts">
// Step 2 of Organize: give files that are already in the bucket a new name in Aruna.
import { computed, ref, watch } from 'vue'
import PagedList from '@/components/storage/PagedList.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { useCursorPage } from '@/composables/useCursorPage'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { previewMove, startMove, type BackendImport, type MoveItem, type OrganizeJob } from '@/lib/api'
import { filesWord, moveProblem, organizeError } from '@/lib/organize'

const props = defineProps<{ groupId: string; link: BackendImport; blocked?: boolean }>()
const emit = defineEmits<{ (e: 'started', job: OrganizeJob): void; (e: 'unsupported'): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

const pattern = ref('')
const target = ref('')
const from = ref('')
const subfolders = ref(false)
const previewed = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
let requestId = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const request = computed(() => {
  // An empty folder is the root of the bucket, not the node's default upload folder.
  return {
    pattern: pattern.value.trim(),
    target: target.value.trim(),
    from: from.value.trim(),
    subfolders: subfolders.value,
  }
})
const problem = computed(() => (pattern.value || target.value ? moveProblem(request.value) : null))
const ready = computed(() => !moveProblem(request.value))

const list = useCursorPage<MoveItem>(
  (query) => previewMove(props.groupId, props.link.import_id, request.value, query, client()),
  () => emit('unsupported'),
)
// The action moves the whole scope, so its count is the one taken without a name filter.
const scopeTotal = ref<{ total: number; complete: boolean } | null>(null)
const total = computed(() => scopeTotal.value?.total ?? 0)
const complete = computed(() => scopeTotal.value?.complete ?? true)
const isBlocked = computed(() => props.blocked || Boolean((list.page.value as { blocked?: unknown } | null)?.blocked))

// Other files or names make an old preview wrong.
watch([pattern, target, from, subfolders], () => {
  list.reset()
  previewed.value = false
  scopeTotal.value = null
})
watch(() => [props.link.import_id, sessionEpoch.value], () => {
  pattern.value = ''
  target.value = ''
  from.value = ''
  subfolders.value = false
  error.value = null
})

async function preview() {
  if (!ready.value) return
  await list.load('')
  const page = list.page.value
  if (page && list.filter.value === '') scopeTotal.value = { total: page.total, complete: page.complete }
  previewed.value = Boolean(page)
}

async function start() {
  if (busy.value || !ready.value || isBlocked.value || writesDisabled.value) return
  const id = ++requestId
  busy.value = true
  error.value = null
  try {
    const job = await startMove(props.groupId, props.link.import_id, request.value, client())
    if (id !== requestId) return
    list.reset()
    previewed.value = false
    emit('started', job)
  } catch (err) {
    if (id !== requestId) return
    if (isUnsupportedEndpoint(err)) emit('unsupported')
    else error.value = organizeError(err)
  } finally {
    if (id === requestId) busy.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2 text-sm">
      Files
      <Input v-model="pattern" placeholder="*.faa.gz" aria-label="Files to move" :disabled="busy" class="h-8 max-w-44 font-mono text-xs" />
      to
      <Input v-model="target" placeholder="proteins/{name}" aria-label="New name" :disabled="busy" class="h-8 max-w-56 font-mono text-xs" />
      <Button variant="outline" size="sm" :disabled="list.busy.value || !ready" @click="preview">Preview</Button>
    </div>
    <p v-if="problem" class="text-[11px] text-destructive">{{ problem }}</p>

    <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Only in folder
      <Input v-model="from" placeholder="whole bucket" aria-label="Only in folder" :disabled="busy" class="h-8 max-w-44 font-mono text-xs" />
      <label class="flex items-center gap-1.5">
        <input v-model="subfolders" type="checkbox" aria-label="Include subfolders" :disabled="busy" />
        Include subfolders
      </label>
    </div>

    <div v-if="previewed && list.page.value" class="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <p class="text-sm">
        <b>{{ complete ? '' : 'At least ' }}{{ filesWord(total) }}</b> match. Files that cannot move stay where they are.
      </p>
      <Notice v-if="isBlocked">Another step is running.</Notice>
      <PagedList
        :total="list.page.value?.total ?? 0"
        :complete="list.page.value?.complete ?? true"
        :offset="list.offset.value"
        :shown="list.items.value.length"
        :filter="list.filter.value"
        :busy="list.busy.value"
        :has-next="list.hasNext.value"
        :has-prev="list.hasPrev.value"
        @next="list.next()"
        @prev="list.prev()"
        @filter="(value: string) => list.load(value)"
      >
        <li v-for="item in list.items.value" :key="item.from" class="flex items-center gap-2 px-3 py-1.5 font-mono">
          <span class="min-w-0 flex-1 truncate" :title="item.from">{{ item.from }}</span>
          <span class="shrink-0 font-sans text-muted-foreground">→</span>
          <span class="min-w-0 flex-1 truncate" :class="item.conflict ? 'text-destructive' : ''" :title="item.to">
            {{ item.to }}<template v-if="item.conflict"> ({{ item.conflict }})</template>
          </span>
        </li>
      </PagedList>
    </div>

    <p class="text-[11px] text-muted-foreground">
      Only the names in Aruna change. Your storage stays as it is. Links by path change. DRS links by content keep working.
    </p>
    <Notice v-if="error || list.error.value" tone="error">{{ error ?? list.error.value }}</Notice>
    <Button
      :disabled="busy || !ready || isBlocked || writesDisabled"
      :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
      @click="start"
    >
      {{ previewed && total ? `Move ${complete ? '' : 'at least '}${filesWord(total)}` : 'Move files' }}
    </Button>
  </div>
</template>
