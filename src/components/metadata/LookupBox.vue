<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { cancelLookup, searchLookups } from '@/lib/lookup/registry'
import type { LookupHit, LookupKind, LookupProviderStatus } from '@/lib/lookup/types'

const MAX_HITS = 6

const props = defineProps<{
  kind: LookupKind
  placeholder?: string
}>()
const emit = defineEmits<{
  (e: 'select', hit: LookupHit): void
  (e: 'status', status: LookupProviderStatus | 'idle'): void
}>()

const query = ref('')
const hits = ref<LookupHit[]>([])
const status = ref<LookupProviderStatus | 'idle'>('idle')
const loading = ref(false)
const searched = ref(false)
const dismissed = ref(false)
const active = ref(-1)
let timer: ReturnType<typeof setTimeout> | undefined

const visible = computed(() => dismissed.value ? [] : hits.value.slice(0, MAX_HITS))

function clearTimer() {
  if (timer === undefined) return
  clearTimeout(timer)
  timer = undefined
}

watch(query, (value) => {
  clearTimer()
  cancelLookup(props.kind)
  hits.value = []
  searched.value = false
  dismissed.value = false
  active.value = -1
  status.value = 'idle'
  emit('status', 'idle')
  if (!value.trim()) {
    loading.value = false
    return
  }
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
  if (hit) emit('select', hit)
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
  <div class="space-y-2">
    <div class="relative">
      <Input
        v-model="query"
        :placeholder="placeholder ?? (kind === 'person' ? 'Search ORCID' : 'Search ROR')"
        :aria-busy="loading"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="visible.length > 0"
        class="pr-9"
        @keydown="onKeydown"
      />
      <Spinner v-if="loading" class="absolute right-3 top-1/2 -translate-y-1/2 text-primary" label="Searching" />
    </div>
    <ul
      v-if="visible.length"
      role="listbox"
      :aria-label="kind === 'person' ? 'ORCID results' : 'ROR results'"
      class="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border"
    >
      <li v-for="(hit, index) in visible" :key="hit.id">
        <!-- mousedown.prevent keeps the input focused so the click still lands. -->
        <button
          type="button"
          role="option"
          :aria-selected="index === active"
          class="flex w-full items-baseline px-2.5 py-1.5 text-left text-xs"
          :class="index === active ? 'bg-muted' : 'hover:bg-muted/40'"
          @mousedown.prevent
          @click="choose(index)"
        >
          <span class="min-w-0 truncate">
            <span class="font-medium text-foreground">{{ hit.label }}</span>
            <span class="text-muted-foreground"> · {{ hit.id }}</span>
            <span v-if="hit.description" class="text-muted-foreground"> · {{ hit.description }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else-if="status === 'offline' || status === 'error'" class="text-xs text-amber-700 dark:text-amber-300">
      {{ kind === 'person' ? 'ORCID' : 'ROR' }} is unavailable. Continue with the manual form below.
    </p>
    <p v-else-if="searched && !loading" class="text-xs text-muted-foreground">
      No matches found. Continue with the manual form below.
    </p>
  </div>
</template>
