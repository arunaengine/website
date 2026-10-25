// The datasets whose linked parts contain a file, or that link a folder or the bucket root.
// A node without the route answers 404, which reads as "not available", never as "no datasets".
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type BucketLinksQuery, type DataLinkDocument, type DataLinksResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type LinksState = 'loading' | 'ready' | 'missing' | 'failed'

export interface LinkTarget {
  bucket: string
  /** A file key, or a folder prefix when `folder` is set. The root is the empty prefix. */
  key: string
  folder: boolean
  /** A bucket on another node is asked of that node, which this portal does not do. */
  remote: boolean
  /** An identifier to ask for instead of a file or folder of the bucket. */
  id?: string
}

function queryOf(target: LinkTarget): BucketLinksQuery {
  return target.folder ? { prefix: target.key, parts_only: true } : { key: target.key, parts_only: true }
}

export function useDatasetLinks(target: Ref<LinkTarget | null>) {
  const { getBucketLinks, getDataLinks, sessionEpoch } = useAruna()
  const documents = ref<DataLinkDocument[]>([])
  const state = ref<LinksState>('loading')
  const error = ref<string | null>(null)
  const complete = ref(true)
  const hidden = ref(false)
  const next = ref<string | null>(null)
  const loadingMore = ref(false)
  let runs = 0

  function take(page: DataLinksResponse, append: boolean) {
    documents.value = append ? [...documents.value, ...page.documents] : page.documents
    complete.value = page.complete
    hidden.value = page.hidden_references_exist
    next.value = page.next_after ?? null
  }

  async function load(append = false) {
    const asked = target.value
    const run = ++runs
    const epoch = sessionEpoch.value
    if (!asked || asked.remote) {
      state.value = 'missing'
      return
    }
    const current = () => run === runs && epoch === sessionEpoch.value
    if (append) loadingMore.value = true
    else state.value = 'loading'
    try {
      const after = append && next.value ? { after: next.value } : {}
      const page = asked.id
        ? await getDataLinks(asked.id, { parts_only: true, ...after })
        : await getBucketLinks(asked.bucket, { ...queryOf(asked), ...after })
      if (!current()) return
      take(page, append)
      state.value = 'ready'
      error.value = null
    } catch (cause) {
      if (!current()) return
      const missing = cause instanceof ApiError && cause.status === 404
      if (!append) documents.value = []
      state.value = append ? state.value : missing ? 'missing' : 'failed'
      error.value = missing ? null : errorMessage(cause)
    } finally {
      if (run === runs) loadingMore.value = false
    }
  }

  watch(
    () => [target.value?.bucket, target.value?.key, target.value?.folder, target.value?.remote, target.value?.id, sessionEpoch.value],
    () => {
      documents.value = []
      next.value = null
      void load()
    },
    { immediate: true },
  )

  return {
    documents,
    state,
    error,
    complete,
    hidden,
    more: computed(() => next.value !== null),
    loadingMore,
    reload: () => load(),
    loadMore: () => load(true),
  }
}
