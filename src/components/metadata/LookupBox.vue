<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { cancelLookup, searchLookups } from '@/lib/lookup/registry'
import type { LookupHit, LookupKind, LookupProviderStatus } from '@/lib/lookup/types'

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
let timer: ReturnType<typeof setTimeout> | undefined

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
        class="pr-9"
      />
      <Spinner v-if="loading" class="absolute right-3 top-1/2 -translate-y-1/2 text-primary" label="Searching" />
    </div>
    <div v-if="hits.length" class="space-y-1">
      <button
        v-for="hit in hits"
        :key="hit.id"
        type="button"
        class="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40"
        @click="emit('select', hit)"
      >
        <span class="block text-sm font-medium text-foreground">{{ hit.label }}</span>
        <span class="block truncate font-mono text-[11px] text-muted-foreground">{{ hit.id }}</span>
        <span v-if="hit.description" class="block text-[11px] text-muted-foreground">{{ hit.description }}</span>
      </button>
    </div>
    <p v-else-if="status === 'offline' || status === 'error'" class="text-xs text-amber-700 dark:text-amber-300">
      {{ kind === 'person' ? 'ORCID' : 'ROR' }} is unavailable. Continue with the manual form below.
    </p>
    <p v-else-if="searched && !loading" class="text-xs text-muted-foreground">
      No matches found. Continue with the manual form below.
    </p>
  </div>
</template>
