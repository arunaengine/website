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
  type RecoveryStatus,
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
/** `stale`: the bucket or its key changed while the removal ran; its outcome is not shown. */
export type RemovalResult = 'removed' | 'confirm' | 'stale'
/** `unknown`: a remaining recovery code is unknown, or the list is partial. */
export type RecoveryAfter = 'kept' | 'unmet' | 'unknown'

/** Whether two ready holders, or one with a recovery code, remain after removing `userId`. */
export function recoveryAfter(response: BucketHoldersResponse, userId: string): RecoveryAfter {
  const remaining = response.holders.filter((holder) => holder.user_id !== userId && holder.state === 'ready')
  const ready = new Set(remaining.map((holder) => holder.user_id))
  if (ready.size >= 2 || remaining.some((holder) => holder.has_recovery === true)) return 'kept'
  const uncertain = response.complete !== true || remaining.some((holder) => holder.has_recovery === null)
  return uncertain ? 'unknown' : 'unmet'
}

/** A partial list proves recovery only when its resolved holders already meet the rule. */
export function listedRecovery(response: BucketHoldersResponse): RecoveryStatus {
  if (response.complete === true || response.recovery.state === 'met') return response.recovery
  return { ...response.recovery, state: 'unknown' }
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

  /** True while the bucket context and the key identity a request began with still hold. */
  function holderBinder(): () => boolean {
    const bound = source.binder()
    const seen = identity.value
    return () => bound() && identity.value === seen
  }

  /** False when a newer bucket context owns the outcome; its success and failure are dropped. */
  async function grant(userId: string): Promise<boolean> {
    const current = holderBinder()
    try {
      await grantBucketHolder(bucket.value, userId, source.client())
    } catch (cause) {
      if (!current()) return false
      await refresh(current)
      if (!current()) return false
      throw cause
    }
    if (!current()) return false
    await refresh(current)
    return current()
  }

  // Without `confirmRecovery` a removal that breaks recovery comes back as `confirm`. `revision`
  // names the holder set the caller showed; the node refuses the removal once the set changed.
  async function remove(userId: string, confirmRecovery: boolean, revision: string): Promise<RemovalResult> {
    const current = holderBinder()
    try {
      await removeBucketHolder(bucket.value, userId, revision, confirmRecovery, source.client())
    } catch (cause) {
      if (!current()) return 'stale'
      if (encryptionRefusal(cause, 409, ENCRYPTION_CODES.confirmRecovery)) return 'confirm'
      if (encryptionRefusal(cause, 409, ENCRYPTION_CODES.staleHolders)) {
        await refresh(current)
        if (!current()) return 'stale'
        throw new Error('The key holders changed meanwhile. Check the list and try again.')
      }
      throw cause
    }
    if (!current()) return 'stale'
    await refresh(current)
    return current() ? 'removed' : 'stale'
  }

  return { holders, state, error, load, grant, remove }
}
