// The database marks that wait for the agreement of the group that owns the bucket. A request is
// listed to the user who asked and to the admins of the owning group; it never leaves the
// management node. Approving publishes the entry, so the database list is read again.
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabases } from '@/composables/useDatabases'
import { apiErrorMessage, type DatabaseRequestView } from '@/lib/api'

const requests = ref<DatabaseRequestView[]>([])
const requestsEpoch = ref(-1)
const loading = ref(false)
const failure = ref<string | null>(null)
let runs = 0

export function useDatabaseRequests() {
  const { listDatabaseRequests, approveDatabaseRequest, dropDatabaseRequest, sessionEpoch, authToken } = useAruna()
  const databases = useDatabases()
  const visible = computed(() => (requestsEpoch.value === sessionEpoch.value ? requests.value : []))

  async function load() {
    const run = ++runs
    const epoch = sessionEpoch.value
    if (!authToken.value) return
    loading.value = true
    failure.value = null
    try {
      const found = await listDatabaseRequests()
      if (run !== runs || epoch !== sessionEpoch.value) return
      requests.value = found
      requestsEpoch.value = epoch
    } catch (cause) {
      if (run === runs && epoch === sessionEpoch.value) failure.value = apiErrorMessage(cause)
    } finally {
      if (run === runs) loading.value = false
    }
  }

  /** Runs one change; a failure is shown, and the lists are read again either way. */
  async function act(work: () => Promise<unknown>): Promise<boolean> {
    failure.value = null
    let refused: string | null = null
    try {
      await work()
      return true
    } catch (cause) {
      refused = apiErrorMessage(cause)
      return false
    } finally {
      await Promise.all([load(), databases.reload()])
      // The refresh starts clean, so the refusal is shown after it.
      if (refused) failure.value = refused
    }
  }

  return {
    requests: visible,
    loading,
    failure,
    ensure: () => {
      if (requestsEpoch.value !== sessionEpoch.value && !loading.value) void load()
    },
    reload: load,
    approve: (requestId: string) => act(() => approveDatabaseRequest(requestId)),
    drop: (requestId: string) => act(() => dropDatabaseRequest(requestId)),
  }
}
