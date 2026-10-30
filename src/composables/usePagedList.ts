import { computed, ref, watch, type Ref } from 'vue'

/** Lists longer than this get the Data-style pager. */
export const PAGE_MIN = 10

// One page of a client-side list; a shorter list falls back to the first page.
export function usePagedList<T>(items: Ref<readonly T[]>) {
  const page = ref(1)
  const pageSize = ref(PAGE_MIN)
  const total = computed(() => items.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  watch([total, pageSize], () => {
    if (page.value > pageCount.value) page.value = pageCount.value
  })
  const shown = computed(() => items.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  return { page, pageSize, total, pageCount, shown, paged: computed(() => total.value > PAGE_MIN) }
}
