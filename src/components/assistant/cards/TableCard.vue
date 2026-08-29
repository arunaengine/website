<script setup lang="ts">
// A table the assistant asked to show: sortable by column, scrolling inside
// its card, copied as CSV in one click.
import { computed, ref } from 'vue'
import Papa from 'papaparse'
import CopyButton from '@/components/ui/CopyButton.vue'
import { ArrowDown, ArrowUp, Table2 } from '@lucide/vue'

const props = defineProps<{ title: string; columns: string[]; rows: unknown[][] }>()

const sortBy = ref(-1)
const descending = ref(false)

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function compare(a: unknown, b: unknown): number {
  const left = typeof a === 'number' ? a : Number(a)
  const right = typeof b === 'number' ? b : Number(b)
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right
  return cell(a).localeCompare(cell(b), 'en', { numeric: true })
}

const sorted = computed(() => {
  if (sortBy.value < 0) return props.rows
  const column = sortBy.value
  const direction = descending.value ? -1 : 1
  return [...props.rows].sort((a, b) => direction * compare(a[column], b[column]))
})

function sort(column: number) {
  if (sortBy.value === column) descending.value = !descending.value
  else {
    sortBy.value = column
    descending.value = false
  }
}

const csv = computed(() => Papa.unparse([props.columns, ...props.rows.map((row) => row.map(cell))]))
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <Table2 class="h-3.5 w-3.5 shrink-0 text-primary" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ title }}</span>
      <span class="text-[11px] text-muted-foreground">{{ rows.length }} {{ rows.length === 1 ? 'row' : 'rows' }}</span>
      <CopyButton :value="csv" label="Copy as CSV" />
    </div>
    <div class="scrollbar-thin max-h-72 overflow-auto">
      <table class="w-full min-w-max text-left">
        <thead class="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
          <tr>
            <th v-for="(column, index) in columns" :key="index" class="px-2.5 py-1.5 font-semibold">
              <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="sort(index)">
                {{ column }}
                <ArrowUp v-if="sortBy === index && !descending" class="h-3 w-3" />
                <ArrowDown v-else-if="sortBy === index" class="h-3 w-3" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in sorted" :key="rowIndex" class="border-t border-border/60">
            <td v-for="(column, index) in columns" :key="index" class="px-2.5 py-1.5 tabular-nums text-foreground/90">
              {{ cell(row[index]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
