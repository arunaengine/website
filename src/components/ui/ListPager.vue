<script setup lang="ts">
// The Data-style pager under a long list: "1-10 of 33", rows per page and the pages.
import { computed } from 'vue'
import Pagination from '@/components/ui/Pagination.vue'
import Select from '@/components/ui/Select.vue'
import { formatCount } from '@/lib/formatCount'

const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ (e: 'update:page', value: number): void; (e: 'update:pageSize', value: number): void }>()

const SIZES = [10, 25, 50, 100].map((size) => ({ value: String(size), label: String(size) }))
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const range = computed(() => {
  const first = (props.page - 1) * props.pageSize + 1
  const last = Math.min(props.page * props.pageSize, props.total)
  return `${formatCount(first)}-${formatCount(last)} of ${formatCount(props.total)}`
})
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground">
    <span class="tabular-nums">{{ range }}</span>
    <div class="flex flex-wrap items-center gap-2">
      <span class="max-sm:hidden">Rows per page</span>
      <Select
        :model-value="String(pageSize)"
        :options="SIZES"
        aria-label="Rows per page"
        class="h-8 w-20 text-xs text-foreground max-sm:hidden"
        @update:model-value="(value: string) => { emit('update:pageSize', Number(value)); emit('update:page', 1) }"
      />
      <Pagination :page="page" :page-count="pageCount" :has-next="page < pageCount" @update:page="(value: number) => emit('update:page', value)" />
    </div>
  </div>
</template>
