<script setup lang="ts">
import { computed } from 'vue'
import Papa from 'papaparse'

const props = defineProps<{ text: string; delimiter?: string }>()

const ROW_CAP = 500

const rows = computed<string[][]>(() => {
  const result = Papa.parse<string[]>(props.text, {
    delimiter: props.delimiter || '',
    skipEmptyLines: 'greedy',
  })
  return result.data
})

const header = computed(() => rows.value[0] ?? [])
const body = computed(() => rows.value.slice(1, 1 + ROW_CAP))
const totalRows = computed(() => Math.max(rows.value.length - 1, 0))
</script>

<template>
  <div class="space-y-2">
    <p class="text-[11px] text-muted-foreground">
      Showing {{ body.length }} of {{ totalRows }} row{{ totalRows === 1 ? '' : 's' }}.
    </p>
    <div class="max-h-[68vh] overflow-auto rounded-md border border-border">
      <table class="w-full border-collapse text-xs">
        <thead class="sticky top-0 bg-muted/70 text-left uppercase tracking-wider text-muted-foreground backdrop-blur">
          <tr>
            <th
              v-for="(cell, index) in header"
              :key="index"
              class="whitespace-nowrap border-b border-border px-3 py-2 font-semibold"
            >
              {{ cell }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in body" :key="rowIndex" class="odd:bg-muted/20">
            <td
              v-for="(cell, cellIndex) in row"
              :key="cellIndex"
              class="whitespace-nowrap border-b border-border px-3 py-1.5 font-mono text-foreground/85"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
