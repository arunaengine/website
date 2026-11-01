// The signed-in user's own bucket order for one group, kept as a user attribute so it
// follows the account. A change shows at once and is written in the order it was made.
import { computed, ref, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { ORDER_PREFIX, encodeOrder, parseOrder } from '@/lib/bucketOrder'
import { errorMessage } from '@/lib/utils'

// The latest unsaved order per attribute, shared by every list of the same group.
const pending = ref<Record<string, string[]>>({})
let writes: Promise<unknown> = Promise.resolve()
const latest: Record<string, number> = {}

export function useBucketOrder(groupId: Ref<string | null | undefined>) {
  const { userInfo, updateUserProfile } = useAruna()

  const key = computed(() => (groupId.value ? `${ORDER_PREFIX}${groupId.value}` : null))
  const canSave = computed(() => Boolean(key.value && userInfo.value))
  const names = computed<string[]>(() => {
    if (!key.value) return []
    return pending.value[key.value] ?? parseOrder(userInfo.value?.user.attributes[key.value])
  })

  function save(next: string[]): Promise<void> {
    const attribute = key.value
    if (!attribute) return Promise.resolve()
    const write = (latest[attribute] = (latest[attribute] ?? 0) + 1)
    pending.value = { ...pending.value, [attribute]: next }
    const value = encodeOrder(next)
    const body = value ? { set_attributes: { [attribute]: value } } : { remove_attributes: [attribute] }
    const run = writes
      .then(() => updateUserProfile(body))
      .catch((err) => reportGlobalError(errorMessage(err)))
      .finally(() => {
        if (write !== latest[attribute]) return
        const { [attribute]: _, ...rest } = pending.value
        pending.value = rest
      })
    writes = run
    return run
  }

  return { names, canSave, save, reset: () => save([]) }
}
