<script setup lang="ts">
// Step 2 of Organize: give files that are already in the bucket a new name in Aruna.
import { computed, ref, watch } from 'vue'
import PagedList from '@/components/storage/PagedList.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  PAGE_SIZE,
  previewMove,
  startMove,
  type BackendImport,
  type MovePreview,
  type OrganizeJob,
} from '@/lib/api'
import { filesWord, moveProblem } from '@/lib/organize'
import { errorMessage, formatNumber } from '@/lib/utils'

const props = defineProps<{ groupId: string; link: BackendImport; blocked?: boolean }>()
const emit = defineEmits<{ (e: 'started', job: OrganizeJob): void; (e: 'unsupported'): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

const pattern = ref('')
const target = ref('')
const plan = ref<MovePreview | null>(null)
const offset = ref(0)
const filter = ref('')
const onlyTaken = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
let requestId = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const request = computed(() => ({ pattern: pattern.value.trim(), target: target.value.trim() }))
const problem = computed(() => (pattern.value || target.value ? moveProblem(request.value) : null))
const ready = computed(() => !moveProblem(request.value))
const movable = computed(() => (plan.value ? plan.value.total - plan.value.taken : 0))

// Other files or names make an old preview wrong.
watch([pattern, target], () => {
  requestId++
  plan.value = null
  busy.value = false
  offset.value = 0
  filter.value = ''
  onlyTaken.value = false
})
watch(() => [props.link.import_id, sessionEpoch.value], () => {
  requestId++
  pattern.value = ''
  target.value = ''
  plan.value = null
  error.value = null
  busy.value = false
})

async function load(page: number, text = filter.value, taken = onlyTaken.value) {
  if (busy.value || !ready.value) return
  const id = ++requestId
  const sent = request.value
  busy.value = true
  error.value = null
  try {
    const result = await previewMove(
      props.groupId,
      props.link.import_id,
      sent,
      { offset: page, limit: PAGE_SIZE, filter: text, onlyTaken: taken },
      client(),
    )
    if (id !== requestId) return
    plan.value = result
    offset.value = page
    filter.value = text
    onlyTaken.value = taken
  } catch (err) {
    if (id !== requestId) return
    if (isUnsupportedEndpoint(err)) emit('unsupported')
    else error.value = errorMessage(err)
  } finally {
    if (id === requestId) busy.value = false
  }
}

async function start() {
  if (busy.value || !ready.value || props.blocked || writesDisabled.value) return
  const id = ++requestId
  busy.value = true
  error.value = null
  try {
    const job = await startMove(props.groupId, props.link.import_id, request.value, client())
    if (id !== requestId) return
    plan.value = null
    emit('started', job)
  } catch (err) {
    if (id !== requestId) return
    if (isUnsupportedEndpoint(err)) emit('unsupported')
    else error.value = errorMessage(err)
  } finally {
    if (id === requestId) busy.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2 text-sm">
      Files
      <Input v-model="pattern" placeholder="*.faa.gz" aria-label="Files to move" class="h-8 max-w-44 font-mono text-xs" />
      to
      <Input v-model="target" placeholder="proteins/{name}" aria-label="New name" class="h-8 max-w-56 font-mono text-xs" />
      <Button variant="outline" size="sm" :disabled="busy || !ready" @click="load(0)">Preview</Button>
    </div>
    <p v-if="problem" class="text-[11px] text-destructive">{{ problem }}</p>

    <div v-if="plan" class="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <p class="text-sm">
        <b>{{ filesWord(movable) }}</b> will move.
        <template v-if="plan.taken">{{ formatNumber(plan.taken) }} {{ plan.taken === 1 ? 'name is' : 'names are' }} taken and stay.</template>
        <span class="text-xs text-muted-foreground">
          Show only:
          <button type="button" :class="onlyTaken ? '' : 'underline'" @click="load(0, filter, false)">all</button>
          ·
          <button type="button" :class="onlyTaken ? 'underline' : ''" @click="load(0, filter, true)">taken</button>
        </span>
      </p>
      <PagedList
        :total="plan.total"
        :offset="offset"
        :shown="plan.items.length"
        :filter="filter"
        :busy="busy"
        @page="(value: number) => load(value)"
        @filter="(value: string) => load(0, value)"
      >
        <li v-for="item in plan.items" :key="item.from" class="flex items-center gap-2 px-3 py-1.5 font-mono">
          <span class="min-w-0 flex-1 truncate" :title="item.from">{{ item.from }}</span>
          <span class="shrink-0 font-sans text-muted-foreground">→</span>
          <span class="min-w-0 flex-1 truncate" :class="item.taken ? 'text-destructive' : ''" :title="item.to">
            {{ item.to }}<template v-if="item.taken"> (taken)</template>
          </span>
        </li>
      </PagedList>
    </div>

    <p class="text-[11px] text-muted-foreground">
      Only the names in Aruna change. Your storage stays as it is. Links by path change. DRS links keep working.
    </p>
    <Notice v-if="error" tone="error">{{ error }}</Notice>
    <Button
      :disabled="busy || !ready || blocked || writesDisabled || (plan !== null && movable === 0)"
      :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
      @click="start"
    >
      {{ plan ? `Move ${filesWord(movable)}` : 'Move files' }}
    </Button>
  </div>
</template>
