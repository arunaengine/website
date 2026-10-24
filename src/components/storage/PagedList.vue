<script setup lang="ts">
// A list of one page of many files, with a name filter and Previous/Next. The rows come from the slot.
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { rangeLabel } from '@/lib/organize'

const props = withDefaults(
  defineProps<{
    total: number
    offset: number
    shown: number
    filter: string
    hasNext: boolean
    hasPrev: boolean
    /** False while the total is a lower bound. */
    complete?: boolean
    busy?: boolean
    /** False hides the name filter, for a node that cannot filter. */
    filterable?: boolean
    /** Replaces the range text when the total counts other things than the rows. */
    summary?: string
  }>(),
  { complete: true, busy: false, filterable: true },
)
const emit = defineEmits<{ (e: 'prev'): void; (e: 'next'): void; (e: 'filter', value: string): void }>()

const draft = ref(props.filter)
watch(() => props.filter, (value) => (draft.value = value))
// The page button last used shows the wait until its page is read.
const going = ref<'prev' | 'next' | null>(null)
watch(() => props.busy, (busy) => busy || (going.value = null))
</script>

<template>
  <div class="space-y-2">
    <slot name="head" />
    <ul class="divide-y divide-border rounded-md border border-border bg-background text-xs">
      <slot />
      <li v-if="!shown" class="px-3 py-2 text-muted-foreground">{{ busy ? 'Loading…' : hasNext ? 'None on this page.' : 'No files.' }}</li>
    </ul>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Input
        v-if="filterable"
        v-model="draft"
        class="h-8 max-w-56 text-xs"
        placeholder="Filter by name…"
        aria-label="Filter by name"
        @change="(going = null), emit('filter', draft.trim())"
      />
      <span v-else />
      <span class="text-[11px] tabular-nums text-muted-foreground">{{ summary ?? (shown || !hasNext ? rangeLabel(offset, shown, total, complete) : '') }}</span>
      <span class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="busy || !hasPrev"
          :aria-busy="busy && going === 'prev'"
          @click="(going = 'prev'), emit('prev')"
        >
          <Spinner v-if="busy && going === 'prev'" label="Loading the page" class="text-current" /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="busy || !hasNext"
          :aria-busy="busy && going === 'next'"
          @click="(going = 'next'), emit('next')"
        >
          <Spinner v-if="busy && going === 'next'" label="Loading the page" class="text-current" /> Next
        </Button>
      </span>
    </div>
  </div>
</template>
