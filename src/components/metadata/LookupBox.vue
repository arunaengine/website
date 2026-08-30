<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { cancelLookup, searchLookups } from '@/lib/lookup/registry'
import type { LookupHit, LookupKind, LookupProviderStatus } from '@/lib/lookup/types'

const MAX_HITS = 6

const props = defineProps<{
  kind: LookupKind
  placeholder?: string
  /** Lets a host share the search box with its own field (the entity name). */
  modelValue?: string
  ariaLabel?: string
}>()
const emit = defineEmits<{
  (e: 'select', hit: LookupHit): void
  (e: 'clear'): void
  (e: 'status', status: LookupProviderStatus | 'idle'): void
  (e: 'update:modelValue', value: string): void
}>()

const query = ref(props.modelValue ?? '')
// A value the host wrote back (a picked hit, an imported record) is an answer,
// not a query: it must not start the next search.
let fromHost = false

watch(() => props.modelValue, (value) => {
  if ((value ?? '') === query.value) return
  fromHost = true
  query.value = value ?? ''
})
const hits = ref<LookupHit[]>([])
const status = ref<LookupProviderStatus | 'idle'>('idle')
const loading = ref(false)
const searched = ref(false)
const dismissed = ref(false)
const active = ref(-1)
const chosen = ref<LookupHit | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

const registryName = computed(() => (props.kind === 'person' ? 'ORCID' : 'ROR'))
const visible = computed(() => (dismissed.value || chosen.value ? [] : hits.value.slice(0, MAX_HITS)))

function clearTimer() {
  if (timer === undefined) return
  clearTimeout(timer)
  timer = undefined
}

function reset() {
  clearTimer()
  cancelLookup(props.kind)
  hits.value = []
  searched.value = false
  dismissed.value = false
  active.value = -1
  loading.value = false
  status.value = 'idle'
}

watch(query, (value) => {
  emit('update:modelValue', value)
  reset()
  emit('status', 'idle')
  if (fromHost) {
    fromHost = false
    return
  }
  chosen.value = null
  if (!value.trim()) return
  loading.value = true
  timer = setTimeout(() => {
    timer = undefined
    void searchLookups(props.kind, value, (update) => {
      hits.value = update.hits
      status.value = update.status
      loading.value = false
      searched.value = true
      emit('status', update.status)
    }, { limit: 10 })
  }, 300)
})

function move(delta: number) {
  if (!visible.value.length) return
  const next = active.value + delta
  active.value = (next + visible.value.length) % visible.value.length
}

function choose(index: number) {
  const hit = visible.value[index]
  if (!hit) return
  reset()
  chosen.value = hit
  emit('select', hit)
}

function forget() {
  chosen.value = null
  reset()
  emit('clear')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    if (active.value < 0) return
    event.preventDefault()
    choose(active.value)
  } else if (event.key === 'Escape') {
    dismissed.value = true
    active.value = -1
  }
}

onScopeDispose(() => {
  clearTimer()
  cancelLookup(props.kind)
})
</script>

<template>
  <div class="min-w-0 space-y-2">
    <div class="relative min-w-0">
      <Input
        v-model="query"
        :placeholder="placeholder ?? `Search ${registryName}`"
        :aria-label="ariaLabel"
        :aria-busy="loading"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="visible.length > 0"
        class="pr-9"
        @keydown="onKeydown"
      />
      <Spinner v-if="loading" class="absolute right-3 top-1/2 -translate-y-1/2 text-primary" label="Searching" />
    </div>
    <div
      v-if="chosen"
      class="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1"
    >
      <span class="hash min-w-0 flex-1 break-all text-foreground" :title="chosen.id">{{ chosen.id }}</span>
      <button
        type="button"
        class="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        :aria-label="`Clear the selected ${registryName}`"
        @click="forget"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>
    <ul
      v-if="visible.length"
      role="listbox"
      :aria-label="`${registryName} results`"
      class="max-h-56 max-w-full divide-y divide-border overflow-y-auto overflow-x-hidden rounded-md border border-border"
    >
      <li v-for="(hit, index) in visible" :key="hit.id" class="min-w-0">
        <!-- mousedown.prevent keeps the input focused so the click still lands. -->
        <button
          type="button"
          role="option"
          :aria-selected="index === active"
          class="flex w-full min-w-0 items-start px-2.5 py-1.5 text-left text-xs"
          :class="index === active ? 'bg-muted' : 'hover:bg-muted/40'"
          @mousedown.prevent
          @click="choose(index)"
        >
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate" :title="`${hit.label} · ${hit.id}`">
              <span class="font-medium text-foreground">{{ hit.label }}</span>
              <span class="text-muted-foreground"> · {{ hit.id }}</span>
            </span>
            <span
              v-if="hit.description"
              class="line-clamp-1 text-muted-foreground"
              :title="hit.description"
            >{{ hit.description }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else-if="status === 'offline' || status === 'error'" class="text-xs text-amber-700 dark:text-amber-300">
      {{ registryName }} is unavailable. Continue with the manual form below.
    </p>
    <p v-else-if="searched && !loading" class="text-xs text-muted-foreground">
      No matches found. Continue with the manual form below.
    </p>
  </div>
</template>
