// Pages of an S3 listing. S3 only lists forward, so the continuation token of
// every page shown so far is kept: Prev lists the page before again, and no
// total count is needed.
import { computed, ref } from 'vue'
import { readStored, storeValue } from './aruna/state'

export const PAGE_SIZES = [10, 25, 50, 100, 200, 500]
const PAGE_SIZE_KEY = 'aruna.data.pageSize'
const DEFAULT_PAGE_SIZE = 25

export function storedPageSize(): number {
  const stored = Number(readStored(PAGE_SIZE_KEY))
  return PAGE_SIZES.includes(stored) ? stored : DEFAULT_PAGE_SIZE
}

export function useListPages() {
  const pageSize = ref(storedPageSize())
  // The token that lists each page; the first page needs none.
  const tokens = ref<(string | undefined)[]>([undefined])
  const nextToken = ref<string | undefined>(undefined)
  const page = computed(() => tokens.value.length)
  const token = computed(() => tokens.value[tokens.value.length - 1])

  function reset() {
    tokens.value = [undefined]
    nextToken.value = undefined
  }

  function next(): boolean {
    if (!nextToken.value) return false
    tokens.value = [...tokens.value, nextToken.value]
    nextToken.value = undefined
    return true
  }

  function previous(): boolean {
    if (tokens.value.length < 2) return false
    tokens.value = tokens.value.slice(0, -1)
    nextToken.value = undefined
    return true
  }

  function setPageSize(size: number) {
    if (!PAGE_SIZES.includes(size)) return
    pageSize.value = size
    storeValue(PAGE_SIZE_KEY, String(size))
    reset()
  }

  return { pageSize, nextToken, page, token, reset, next, previous, setPageSize }
}
