<script setup lang="ts">
// A list of one page of many files, with a name filter and Previous/Next. The rows come from the slot.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { PAGE_SIZE } from '@/lib/api'
import { rangeLabel } from '@/lib/organize'

const props = withDefaults(
  defineProps<{ total: number; offset: number; shown: number; filter: string; busy?: boolean; pageSize?: number }>(),
  { busy: false, pageSize: PAGE_SIZE },
)
const emit = defineEmits<{ (e: 'page', offset: number): void; (e: 'filter', value: string): void }>()

const draft = ref(props.filter)
watch(() => props.filter, (value) => (draft.value = value))

const hasNext = computed(() => props.offset + props.shown < props.total)
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
      <span class="text-[11px] tabular-nums text-muted-foreground">{{ rangeLabel(offset, shown, total) }}</span>
      <span class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="busy || offset === 0" @click="emit('page', Math.max(offset - pageSize, 0))">
          Previous
        </Button>
        <Button variant="outline" size="sm" :disabled="busy || !hasNext" @click="emit('page', offset + pageSize)">
          Next
        </Button>
      </span>
    </div>
  </div>
</template>
