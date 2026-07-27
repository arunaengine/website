<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

// Pager for offset listings. `pageCount` may be approximate or unknown (null),
// so `hasNext` is the authority for "there is another page": a caller that only
// knows it received a full page still gets working Previous/Next navigation.
const props = defineProps<{
  page: number
  pageCount?: number | null
  hasNext?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:page', page: number): void }>()

const WINDOW = 2

// First page, last page and a window around the current one; null marks a gap.
const buttons = computed<Array<number | null>>(() => {
  const count = props.pageCount
  if (!count || count < 2) return []
  const shown = new Set<number>([1, count])
  for (let page = props.page - WINDOW; page <= props.page + WINDOW; page++) {
    if (page >= 1 && page <= count) shown.add(page)
  }
  const entries: Array<number | null> = []
  let previous = 0
  for (const page of [...shown].sort((a, b) => a - b)) {
    if (previous && page - previous > 1) entries.push(null)
    entries.push(page)
    previous = page
  }
  return entries
})

const visible = computed(() => props.page > 1 || Boolean(props.hasNext) || buttons.value.length > 0)

function go(page: number) {
  if (props.disabled || page === props.page || page < 1) return
  emit('update:page', page)
}
</script>

<template>
  <nav v-if="visible" class="flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
    <button
      type="button"
      class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="disabled || page <= 1"
      aria-label="Previous page"
      @click="go(page - 1)"
    >
      <ChevronLeft class="h-3.5 w-3.5" />
    </button>
    <template v-for="(entry, index) in buttons" :key="index">
      <span v-if="entry === null" class="px-1 text-[11px] text-muted-foreground">…</span>
      <button
        v-else
        type="button"
        class="h-7 min-w-7 rounded-md border px-2 text-[11px] tabular-nums transition-colors disabled:cursor-not-allowed"
        :class="entry === page
          ? 'border-primary/50 bg-primary/10 font-medium text-primary'
          : 'border-border bg-background text-foreground/70 hover:bg-muted disabled:opacity-40'"
        :disabled="disabled && entry !== page"
        :aria-current="entry === page ? 'page' : undefined"
        :aria-label="`Page ${entry}`"
        @click="go(entry)"
      >
        {{ entry }}
      </button>
    </template>
    <button
      type="button"
      class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="disabled || !hasNext"
      aria-label="Next page"
      @click="go(page + 1)"
    >
      <ChevronRight class="h-3.5 w-3.5" />
    </button>
  </nav>
</template>
