// Encryption state of one bucket, asked of the node that hosts it. An answer is
// kept only while the account, session, realm, node API base, group and bucket
// it was asked for are still current; anything else is dropped unseen.
import { computed, ref, watch, type Ref } from 'vue'
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
import { unlockWithVault, type UnlockOutcome } from '@/lib/vault/bucketUnlock'
import { authToken, nodeInfo, realmInfo, sessionEpoch, userInfo } from './aruna/state'
import { localNodeId, nodeApiBase } from './s3/endpoints'
import { useUserVault } from './useUserVault'

/** `missing`: the node does not report encryption for this bucket, which is not "off". */
export type EncryptionLoadState = 'loading' | 'ready' | 'missing' | 'refused' | 'unresolved' | 'failed'
export type EncryptionAction = 'unlock' | 'extend' | 'lock' | 'save' | 'rotate'

export function useBucketEncryption(bucket: Ref<string>, nodeId: Ref<string | null>, groupId: Ref<string | null>) {
  const vault = useUserVault()
  const status = ref<BucketEncryptionResponse | null>(null)
  const compression = ref<BucketCompressionResponse | null>(null)
  const state = ref<EncryptionLoadState>('loading')
  const error = ref<string | null>(null)
  const refreshing = ref(false)
  const busy = ref<EncryptionAction | null>(null)
  /** An unlock whose answer never came; only a successful status read clears it. */
  const outcomeUnknown = ref(false)
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

  /** A check that stays true while the scope a request started in is current. */
  function binder(): () => boolean {
    const key = scopeKey.value
    return () => scopeKey.value === key
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
    compression.value = compressed.status === 'fulfilled' ? compressed.value : null
    if (encryption.status === 'fulfilled') {
      status.value = encryption.value
      state.value = 'ready'
      error.value = null
      outcomeUnknown.value = false
      return
    }
    status.value = null
    state.value = failed(encryption.reason)
    error.value = apiErrorMessage(encryption.reason)
  }

  async function run<T>(action: EncryptionAction, work: (bound: () => boolean) => Promise<T>): Promise<T | null> {
    if (busy.value) throw new Error('Another change to this bucket is still running.')
    const bound = binder()
    busy.value = action
    try {
      const result = await work(bound)
      return bound() ? result : null
    } finally {
      // The status is read again before any outcome is shown, also after a failure.
      if (bound()) {
        await load()
        busy.value = null
      }
    }
  }

  /** Opens the caller's copy in this browser and sends only the bucket key to the node. */
  function unlock(durationMs?: number): Promise<UnlockOutcome | null> {
    const seen = status.value
    if (outcomeUnknown.value) {
      return Promise.reject(new Error('The last unlock was not confirmed. Reload the status before trying again.'))
    }
    if (!seen?.bucket_id || !seen.public_key) return Promise.reject(new Error('This bucket has no key to unlock.'))
    const { bucket_id: bucketId, key_generation: generation, public_key: publicKey } = seen
    return run('unlock', async (bound) => {
      const live = () => bound() && status.value?.bucket_id === bucketId && status.value.key_generation === generation
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

  function extend(durationMs?: number) {
    const session = status.value?.unlock?.session_id
    if (!session) return Promise.reject(new Error('The bucket is not unlocked.'))
    return run('extend', () => extendUnlock(scope.value.bucket, { session_id: session, duration_ms: durationMs }, client()))
  }

  function lock() {
    return run('lock', () => lockBucket(scope.value.bucket, client()))
  }

  function save(request: PutBucketEncryptionRequest) {
    return run('save', () => putBucketEncryption(scope.value.bucket, request, client()))
  }

  function rotate() {
    const generation = status.value?.key_generation
    if (generation === undefined) return Promise.reject(new Error('The bucket status is not known.'))
    return run('rotate', () => rotateBucketKey(scope.value.bucket, generation, client()))
  }

  watch(
    scopeKey,
    () => {
      status.value = null
      compression.value = null
      error.value = null
      busy.value = null
      refreshing.value = false
      outcomeUnknown.value = false
      state.value = 'loading'
      void load()
    },
    { immediate: true },
  )

  return {
    status,
    compression,
    state,
    error,
    refreshing,
    busy,
    outcomeUnknown,
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
