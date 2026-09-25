// The History tab's data: branches, tags, kept conflicts and one page-wise
// version list for the selected branch. Every answer is bound to the document,
// the session and the latest request, so a late answer never lands elsewhere.
//
// Per-view FACTORY: call it once, from the dataset route view's setup.
import { computed, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import {
  listBranches,
  listConflicts,
  listTags,
  listVersions,
  type DatasetBranch,
  type DatasetTag,
  type DatasetVersion,
  type VersionConflict,
} from '@/lib/api'
import { authorName, historyProblem, sortBranches, type HistoryProblem } from '@/lib/versions'
import { errorMessage } from '@/lib/utils'

const PAGE_SIZE = 50

export function useDatasetHistory(documentId: Ref<string>, enabled: () => boolean, active: () => boolean) {
  const route = useRoute()
  const router = useRouter()
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const { resolveUsers, cachedUser } = useUserDirectory()
  const client = () => ({ baseUrl: apiBaseUrl.value, token: authToken.value })

  // Null until a node answered; false when it predates the versions routes.
  const supported = ref<boolean | null>(null)
  const branches = ref<DatasetBranch[] | null>(null)
  const tags = ref<DatasetTag[]>([])
  const conflicts = ref<VersionConflict[]>([])
  const refsProblem = ref<HistoryProblem | null>(null)

  const versions = ref<DatasetVersion[] | null>(null)
  const nextCursor = ref<string | null>(null)
  const loadingMore = ref(false)
  const moreError = ref('')
  const listProblem = ref<HistoryProblem | null>(null)
  const problemMessage = ref('')

  const branch = computed({
    get: () => (typeof route.query.branch === 'string' && route.query.branch ? route.query.branch : 'main'),
    set: (next: string) => {
      const query = { ...route.query }
      if (next === 'main') delete query.branch
      else query.branch = next
      void router.replace({ query })
    },
  })
  const selected = computed(() => branches.value?.find((entry) => entry.name === branch.value) ?? null)
  // Drafts are the unprotected branches; their list leaves out what main shares.
  const isDraft = computed(() => selected.value?.protected === false)

  const state = computed<HistoryProblem | 'loading' | 'ready'>(() => {
    const problem = refsProblem.value ?? listProblem.value
    if (problem) return problem
    return versions.value === null ? 'loading' : 'ready'
  })

  function headOf(name: string): string | undefined {
    return branches.value?.find((entry) => entry.name === name)?.version
  }

  function author(version: DatasetVersion): string {
    const id = version.author.user_id
    return authorName(version, id ? cachedUser(id)?.name : null)
  }

  // One resolve call per page; the directory batches and caches per session.
  function resolveAuthors(list: DatasetVersion[]) {
    const ids = list.map((version) => version.author.user_id).filter((id): id is string => Boolean(id))
    if (ids.length) void resolveUsers(ids)
  }

  function stamp() {
    const epoch = sessionEpoch.value
    const id = documentId.value
    return () => epoch === sessionEpoch.value && id === documentId.value
  }

  let refsToken = 0
  async function loadRefs(): Promise<boolean> {
    const token = ++refsToken
    const same = stamp()
    const live = () => token === refsToken && same()
    try {
      const [branchList, tagList, conflictList] = await Promise.all([
        listBranches(documentId.value, client()),
        listTags(documentId.value, client()),
        listConflicts(documentId.value, client()),
      ])
      if (!live()) return false
      supported.value = true
      refsProblem.value = null
      branches.value = sortBranches(branchList)
      tags.value = tagList
      conflicts.value = conflictList
      resolveAuthors(conflictList.map((conflict) => conflict.version))
      if (branch.value !== 'main' && !branchList.some((entry) => entry.name === branch.value)) branch.value = 'main'
      return true
    } catch (err) {
      if (!live()) return false
      const problem = historyProblem(err)
      supported.value = problem !== 'unsupported'
      refsProblem.value = problem
      problemMessage.value = errorMessage(err)
      return false
    }
  }

  let listToken = 0
  async function loadList() {
    const token = ++listToken
    const same = stamp()
    const live = () => token === listToken && same()
    versions.value = null
    nextCursor.value = null
    loadingMore.value = false
    moreError.value = ''
    listProblem.value = null
    try {
      const since = isDraft.value ? 'main' : undefined
      const page = await listVersions(documentId.value, { branch: branch.value, since, limit: PAGE_SIZE }, client())
      if (!live()) return
      versions.value = page.versions
      nextCursor.value = page.next_cursor ?? null
      resolveAuthors(page.versions)
    } catch (err) {
      if (!live()) return
      listProblem.value = historyProblem(err)
      problemMessage.value = errorMessage(err)
    }
  }

  async function loadMore() {
    const cursor = nextCursor.value
    if (!cursor || loadingMore.value) return
    const token = listToken
    const same = stamp()
    const live = () => token === listToken && same()
    loadingMore.value = true
    moreError.value = ''
    try {
      const since = isDraft.value ? 'main' : undefined
      const page = await listVersions(documentId.value, { branch: branch.value, since, cursor, limit: PAGE_SIZE }, client())
      if (!live()) return
      versions.value = [...(versions.value ?? []), ...page.versions]
      nextCursor.value = page.next_cursor ?? null
      resolveAuthors(page.versions)
    } catch (err) {
      if (live()) moreError.value = errorMessage(err)
    } finally {
      if (live()) loadingMore.value = false
    }
  }

  // Also the step after every write: cursors pin the head they started from.
  async function refresh() {
    versions.value = null
    listProblem.value = null
    if ((await loadRefs()) && active()) await loadList()
  }

  watch(
    [documentId, sessionEpoch, enabled],
    () => {
      refsToken++
      listToken++
      supported.value = null
      branches.value = null
      tags.value = []
      conflicts.value = []
      refsProblem.value = null
      versions.value = null
      listProblem.value = null
      if (enabled()) void refresh()
    },
    { immediate: true },
  )

  watch(branch, () => {
    if (enabled() && active() && branches.value) void loadList()
  })

  watch(active, (on) => {
    if (on && enabled() && branches.value && versions.value === null && !listProblem.value) void loadList()
  })

  return {
    documentId,
    client,
    supported,
    branches,
    tags,
    conflicts,
    branch,
    selected,
    isDraft,
    versions,
    nextCursor,
    loadingMore,
    moreError,
    state,
    problemMessage,
    headOf,
    author,
    refresh,
    loadMore,
  }
}

export type DatasetHistoryState = ReturnType<typeof useDatasetHistory>
