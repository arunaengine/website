// Key holders of one encrypted bucket, asked of the node that hosts it. Removal
// names the holder revision it saw, so a changed set is refused, and breaking
// the recovery rule needs an explicit confirmation.
import { computed, ref, watch, type Ref } from 'vue'
import {
  ApiError,
  ENCRYPTION_CODES,
  encryptionRefusal,
  grantBucketHolder,
  listBucketHolders,
  removeBucketHolder,
  type ApiClientOptions,
  type BucketEncryptionResponse,
  type BucketHolderEntry,
  type BucketHoldersResponse,
} from '@/lib/api'
import { encryptionError } from '@/lib/bucketEncryption'

export interface HolderSource {
  client(): ApiClientOptions
  binder(): () => boolean
  load(): Promise<void>
  status: Ref<BucketEncryptionResponse | null>
  /** Grows with every status read, so key actions and refreshes read the holders again. */
  revision: Ref<number>
}

export type HoldersState = 'loading' | 'ready' | 'refused' | 'failed'
export type RemovalResult = 'removed' | 'confirm'

/** True when removing `userId` would leave fewer than two ready holders and no ready recovery code. */
export function breaksRecovery(holders: BucketHolderEntry[], userId: string): boolean {
  const remaining = holders.filter((holder) => holder.user_id !== userId && holder.state === 'ready')
  const ready = new Set(remaining.map((holder) => holder.user_id))
  return ready.size < 2 && !remaining.some((holder) => holder.has_recovery === true)
}

export function useBucketHolders(source: HolderSource, bucket: Ref<string>) {
  const holders = ref<BucketHoldersResponse | null>(null)
  const state = ref<HoldersState>('loading')
  const error = ref<string | null>(null)
  let loads = 0
  // Holders belong to one bucket identity and key generation; another one starts empty.
  const identity = computed(() => `${bucket.value}/${source.status.value?.bucket_id ?? ''}/${source.status.value?.key_generation ?? ''}`)

  async function load(): Promise<void> {
    const run = ++loads
    const bound = source.binder()
    const seen = identity.value
    state.value = holders.value ? state.value : 'loading'
    try {
      const response = await listBucketHolders(bucket.value, source.client())
      if (!bound() || run !== loads || identity.value !== seen) return
      holders.value = response
      state.value = 'ready'
      error.value = null
    } catch (cause) {
      if (!bound() || run !== loads || identity.value !== seen) return
      holders.value = null
      const refused = cause instanceof ApiError && (cause.status === 401 || cause.status === 403)
      state.value = refused ? 'refused' : 'failed'
      error.value = encryptionError(cause)
    }
  }

  /** A new status read bumps the revision, which reads the holders again. */
  async function refresh(bound: () => boolean) {
    if (bound()) await source.load()
  }

  watch(
    identity,
    () => {
      loads += 1
      holders.value = null
      state.value = 'loading'
      error.value = null
      void load()
    },
    { immediate: true },
  )
  watch(source.revision, () => void load())

  async function grant(userId: string): Promise<void> {
    const bound = source.binder()
    try {
      await grantBucketHolder(bucket.value, userId, source.client())
    } finally {
      await refresh(bound)
    }
  }

  /** Without `confirmRecovery`, a removal that breaks recovery comes back as `confirm`. */
  async function remove(userId: string, confirmRecovery: boolean): Promise<RemovalResult> {
    const revision = holders.value?.revision
    if (!revision) throw new Error('The key holders are not known yet.')
    const bound = source.binder()
    try {
      await removeBucketHolder(bucket.value, userId, revision, confirmRecovery, source.client())
    } catch (cause) {
      if (encryptionRefusal(cause, 409, ENCRYPTION_CODES.confirmRecovery)) return 'confirm'
      if (encryptionRefusal(cause, 409, ENCRYPTION_CODES.staleHolders)) {
        await refresh(bound)
        throw new Error('The key holders changed meanwhile. Check the list and try again.')
      }
      throw cause
    }
    await refresh(bound)
    return 'removed'
  }

  return { holders, state, error, load, grant, remove }
}
