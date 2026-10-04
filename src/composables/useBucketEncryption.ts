// Encryption state of one bucket, asked of the node that hosts it. An answer is
// kept only while the account, session, realm, node API base, group and bucket
// it was asked for are still current; anything else is dropped unseen.
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import {
  ApiError,
  apiErrorMessage,
  extendUnlock,
  getBucketCompression,
  getBucketEncryption,
  lockBucket,
  putBucketEncryption,
  rotateBucketKey,
  type ApiClientOptions,
  type BucketCompressionResponse,
  type BucketEncryptionResponse,
  type PutBucketEncryptionRequest,
} from '@/lib/api'
import { keyGenerations } from '@/lib/bucketEncryption'
import { unlockWithVault, type UnlockOutcome } from '@/lib/vault/bucketUnlock'
import { authToken, nodeInfo, realmInfo, sessionEpoch, userInfo } from './aruna/state'
import { localNodeId, nodeApiBase } from './s3/endpoints'
import { useUserVault } from './useUserVault'

// `missing`: the node does not report encryption for this bucket, which is not "off".
// `stale`: the last read failed; the status is the previous answer and changes are held back.
export type EncryptionLoadState = 'loading' | 'ready' | 'stale' | 'missing' | 'refused' | 'unresolved' | 'failed'
export type EncryptionAction = 'unlock' | 'extend' | 'lock' | 'save' | 'rotate'

export function useBucketEncryption(bucket: Ref<string>, nodeId: Ref<string | null>, groupId: Ref<string | null>) {
  const vault = useUserVault()
  const status = ref<BucketEncryptionResponse | null>(null)
  const compression = ref<BucketCompressionResponse | null>(null)
  const state = ref<EncryptionLoadState>('loading')
  const error = ref<string | null>(null)
  const refreshing = ref(false)
  const busy = ref<EncryptionAction | null>(null)
  /** Counts successful status reads. */
  const revision = ref(0)
  /** An unlock whose answer never came; only a successful status read clears it. */
  const outcomeUnknown = ref(false)
  // Grows on every context change and on disposal and never goes back, so a
  // request from bucket A stays dead when the page returns to bucket A.
  let generation = 0
  let loads = 0

  const scope = computed(() => {
    const node = nodeId.value ?? localNodeId() ?? ''
    return {
      userId: userInfo.value?.user.user_id ?? '',
      realmId: userInfo.value?.realm.realm_id ?? realmInfo.value?.realm_id ?? '',
      epoch: sessionEpoch.value,
      nodeId: node,
      apiBase: node ? (nodeApiBase(node) ?? '') : '',
      groupId: groupId.value ?? '',
      bucket: bucket.value,
    }
  })
  const scopeKey = computed(() => JSON.stringify(scope.value))

  function client(): ApiClientOptions {
    return { baseUrl: scope.value.apiBase, token: authToken.value }
  }

  /** A check that stays true until the context changes or the state is disposed. */
  function binder(): () => boolean {
    const captured = generation
    return () => captured === generation
  }

  function failed(cause: unknown): EncryptionLoadState {
    if (!(cause instanceof ApiError)) return 'failed'
    if (cause.status === 404 || cause.status === 405) return 'missing'
    return cause.status === 401 || cause.status === 403 ? 'refused' : 'failed'
  }

  async function load(): Promise<void> {
    const run = ++loads
    const bound = binder()
    const live = () => bound() && run === loads
    const { apiBase, nodeId: node } = scope.value
    if (!apiBase) {
      status.value = null
      state.value = node || nodeInfo.value ? 'unresolved' : 'loading'
      return
    }
    refreshing.value = true
    const [encryption, compressed] = await Promise.allSettled([
      getBucketEncryption(scope.value.bucket, client()),
      getBucketCompression(scope.value.bucket, client()),
    ])
    if (!live()) return
    refreshing.value = false
    if (encryption.status === 'fulfilled') {
      compression.value = compressed.status === 'fulfilled' ? compressed.value : null
      status.value = encryption.value
      revision.value += 1
      state.value = 'ready'
      error.value = null
      outcomeUnknown.value = false
      return
    }
    const next = failed(encryption.reason)
    error.value = apiErrorMessage(encryption.reason)
    if (next === 'failed' && status.value) {
      // A passing failure keeps the last answer, marked out of date, so an open draft survives.
      state.value = 'stale'
      return
    }
    status.value = null
    compression.value = null
    state.value = next
  }

  async function run<T>(action: EncryptionAction, work: (bound: () => boolean) => Promise<T>): Promise<T | null> {
    if (busy.value) throw new Error('Another change to this bucket is still running.')
    if (state.value !== 'ready') throw new Error('The state of this bucket is not known right now. Read it again first.')
    const bound = binder()
    busy.value = action
    let outcome: { done: true; value: T } | { done: false; cause: unknown }
    try {
      outcome = { done: true, value: await work(bound) }
    } catch (cause) {
      outcome = { done: false, cause }
    }
    // The status is read again before any outcome is shown, also after a failure. A request
    // from an older context delivers nothing and leaves the busy flag of the new one alone.
    if (!bound()) return null
    await load()
    if (!bound()) return null
    busy.value = null
    if (!outcome.done) throw outcome.cause
    return outcome.value
  }

  /** The generation as the current status lists it, active or source. */
  function keyOf(keyGeneration: number) {
    return status.value ? keyGenerations(status.value).list.find((entry) => entry.generation === keyGeneration) : undefined
  }

  /** Opens the caller's copy of one generation here and sends only that key to the node. */
  function unlock(keyGeneration: number, durationMs?: number): Promise<UnlockOutcome | null> {
    if (outcomeUnknown.value) {
      return Promise.reject(new Error('The last unlock was not confirmed. Reload the status before trying again.'))
    }
    const bucketId = status.value?.bucket_id
    const publicKey = keyOf(keyGeneration)?.public_key
    if (!bucketId || !publicKey) return Promise.reject(new Error('This bucket has no such key to unlock.'))
    const generation = keyGeneration
    return run('unlock', async (bound) => {
      const live = () => bound() && status.value?.bucket_id === bucketId && keyOf(generation)?.public_key === publicKey
      const { realmId, nodeId: node, userId } = scope.value
      const outcome = await unlockWithVault(
        {
          bucket: scope.value.bucket,
          client: client(),
          context: { realmId, nodeId: node, bucketId, generation, userId },
          publicKey,
          durationMs,
        },
        vault,
        live,
      )
      if (outcome.kind === 'unknown' && bound()) outcomeUnknown.value = true
      return outcome
    })
  }

  function extend(keyGeneration: number, durationMs?: number) {
    const session = keyOf(keyGeneration)?.unlock.session_id
    if (!session) return Promise.reject(new Error('This key is not unlocked.'))
    const request = { generation: keyGeneration, session_id: session, duration_ms: durationMs }
    return run('extend', () => extendUnlock(scope.value.bucket, request, client()))
  }

  function lock() {
    return run('lock', () => lockBucket(scope.value.bucket, client()))
  }

  function save(request: PutBucketEncryptionRequest) {
    return run('save', () => putBucketEncryption(scope.value.bucket, request, client()))
  }

  function rotate(expectedGeneration: number) {
    return run('rotate', () => rotateBucketKey(scope.value.bucket, expectedGeneration, client()))
  }

  watch(
    scopeKey,
    () => {
      generation += 1
      status.value = null
      compression.value = null
      error.value = null
      busy.value = null
      refreshing.value = false
      outcomeUnknown.value = false
      state.value = 'loading'
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    generation += 1
  })

  return {
    status,
    compression,
    state,
    error,
    refreshing,
    busy,
    outcomeUnknown,
    revision,
    nodeId: computed(() => scope.value.nodeId || null),
    load,
    unlock,
    extend,
    lock,
    save,
    rotate,
    client,
    binder,
  }
}
