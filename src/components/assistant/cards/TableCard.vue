<script setup lang="ts">
// A table the assistant asked to show: sortable by column, scrolling inside
// its card, copied as CSV in one click.
import { computed, ref } from 'vue'
import Papa from 'papaparse'
import BucketLink from '@/components/assistant/BucketLink.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import ObjectLink from '@/components/assistant/ObjectLink.vue'
import { keyIn } from '@/lib/assistant/objectLinks'
import { usePageContext } from '@/composables/usePageContext'
import { truncateMiddle } from '@/lib/utils'
import { ArrowDown, ArrowUp, Table2 } from '@lucide/vue'

const props = withDefaults(defineProps<{
  title: string
  columns: string[]
  rows: unknown[][]
  /** Set when the rows are about stored objects, so file names link. */
  bucket?: string
}>(), { bucket: undefined })

const sortBy = ref(-1)
const descending = ref(false)

// The bucket the rows are about: the one the tool declared, else the one the
// reader has open. Without one no cell links, so a listing never links some
// of its files and leaves the rest as text.
const { currentPage } = usePageContext()
const bucket = computed(() => props.bucket || currentPage()?.details.bucket || '')

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

// A cell value is a key inside the table's bucket, never a bucket and a key:
// splitting it invents a bucket that does not exist.
function objectOf(value: unknown) {
  return bucket.value && typeof value === 'string' ? keyIn(bucket.value, value.trim()) : null
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

// An opaque id (an ETag, a hash, a ULID) says nothing in the middle, so it is
// shortened to keep the row on one line, and a raw instant is shown as local
// time. The exact value stays in the title.
const ID_LIKE = /^"?[A-Za-z0-9]{24,}(-[A-Za-z0-9]+)?"?$/
const INSTANT_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function shown(text: string, linked: boolean): string {
  if (linked) return text
  if (INSTANT_LIKE.test(text)) return new Date(text).toLocaleString()
  return ID_LIKE.test(text) ? truncateMiddle(text, 8, 5) : text
}

const body = computed(() => sorted.value.map((row) => props.columns.map((_, index) => {
  const text = cell(row[index])
  const object = objectOf(row[index])
  return { text, object, label: shown(text, Boolean(object)) }
})))

const csv = computed(() => Papa.unparse([props.columns, ...props.rows.map((row) => row.map(cell))]))
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <Table2 class="h-3.5 w-3.5 shrink-0 text-primary" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ title }}</span>
      <BucketLink
        v-if="bucket"
        :bucket="bucket"
        class="shrink-0 truncate text-[11px] text-primary hover:underline"
        :title="`Open the bucket ${bucket}`"
      >{{ bucket }}</BucketLink>
      <span class="shrink-0 text-[11px] text-muted-foreground">{{ rows.length }} {{ rows.length === 1 ? 'row' : 'rows' }}</span>
      <CopyButton :value="csv" label="Copy as CSV" />
    </div>
    <div class="scrollbar-thin max-h-72 overflow-auto">
      <table class="w-full table-auto text-left">
        <thead class="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
          <tr>
            <th v-for="(column, index) in columns" :key="index" class="whitespace-nowrap px-2.5 py-1.5 font-semibold">
              <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="sort(index)">
                {{ column }}
                <ArrowUp v-if="sortBy === index && !descending" class="h-3 w-3" />
                <ArrowDown v-else-if="sortBy === index" class="h-3 w-3" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in body" :key="rowIndex" class="border-t border-border/60">
            <td
              v-for="(item, index) in row"
              :key="index"
              class="max-w-[18rem] truncate px-2.5 py-1.5 tabular-nums text-foreground/90"
              :title="item.text"
            >
              <ObjectLink
                v-if="item.object"
                :bucket="item.object.bucket"
                :object-key="item.object.key"
                class="text-primary hover:underline"
              >{{ item.text }}</ObjectLink>
              <template v-else>{{ item.label }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
