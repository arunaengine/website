<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  page: number
  pageSize: number
  total: number
  label?: string
}>()
const emit = defineEmits<{ (e: 'update:page', page: number): void }>()

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize)),
)
const start = computed(() =>
  props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1,
)
const end = computed(() => Math.min(props.total, props.page * props.pageSize))

function go(delta: number) {
  const next = Math.min(totalPages.value, Math.max(1, props.page + delta))
  if (next !== props.page) emit('update:page', next)
}
</script>

<template>
  <div
    v-if="total > pageSize"
    class="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground"
  >
    <span>
      {{ start }}–{{ end }} of {{ total }}{{ label ? ` ${label}` : '' }}
    </span>
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page <= 1"
        aria-label="Previous page"
        @click="go(-1)"
      >
        <ChevronLeft class="h-3.5 w-3.5" />
      </button>
      <span class="px-2 tabular-nums text-foreground/70">
        {{ page }} / {{ totalPages }}
      </span>
      <button
        type="button"
        class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page >= totalPages"
        aria-label="Next page"
        @click="go(1)"
      >
        <ChevronRight class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
