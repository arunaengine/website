<script setup lang="ts">
// A list of one page of many files, with a name filter and Previous/Next. The rows come from the slot.
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
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
  }>(),
  { complete: true, busy: false },
)
const emit = defineEmits<{ (e: 'prev'): void; (e: 'next'): void; (e: 'filter', value: string): void }>()

const draft = ref(props.filter)
watch(() => props.filter, (value) => (draft.value = value))
</script>

<template>
  <div class="space-y-2">
    <slot name="head" />
    <ul class="divide-y divide-border rounded-md border border-border bg-background text-xs">
      <slot />
      <li v-if="!shown" class="px-3 py-2 text-muted-foreground">{{ busy ? 'Loading…' : 'No files.' }}</li>
    </ul>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Input
        v-model="draft"
        class="h-8 max-w-56 text-xs"
        placeholder="Filter by name…"
        aria-label="Filter by name"
        @change="emit('filter', draft.trim())"
      />
      <span class="text-[11px] tabular-nums text-muted-foreground">{{ rangeLabel(offset, shown, total, complete) }}</span>
      <span class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="busy || !hasPrev" @click="emit('prev')">Previous</Button>
        <Button variant="outline" size="sm" :disabled="busy || !hasNext" @click="emit('next')">Next</Button>
      </span>
    </div>
  </div>
</template>
