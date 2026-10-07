// One read of a locked bucket with the caller's scoped key, and what it waits for: the personal
// vault, a key from a key holder, or a copy still being prepared. Waits resume on their own.
import { ref, watch } from 'vue'
import {
  ReadWaitError,
  fetchEnvelope,
  ownGrants,
  readWithGrant,
  requestKey,
  usableGrant,
  type KeyedTarget,
  type ReadWait,
} from '@/lib/vault/keyedRead'
import { closeKeyWorker } from '@/lib/vault/keyWorker'
import { authToken, sessionEpoch, userInfo } from './aruna/state'
import { localNodeId, nodeApiBase } from './s3/endpoints'
import { useS3 } from './useS3'
import { useUserVault } from './useUserVault'

export const POLL_MS = 15_000

/** A newer read, a cancel or a session change ended this one. */
export class ReadEndedError extends Error {
  constructor() {
    super('The read was cancelled.')
    this.name = 'ReadEndedError'
  }
}

/** A file to read; an absent node is the connected one, an absent version the current one. */
export interface KeyedObject {
  bucket: string
  key: string
  nodeId?: string | null
  versionId?: string | null
}

export function useKeyedRead() {
  const vault = useUserVault()
  /** What the current read waits for; `vault` asks the user to open their personal vault. */
  const wait = ref<ReadWait | 'vault' | null>(null)
  /** Files of this view whose read waits for a key, as `bucket` and `key` joined by a zero byte. */
  const pending = ref(new Set<string>())
  let run = 0
  let wake: (() => void) | null = null
  let abort: AbortController | null = null
  /** The current read opens an object key or downloads with it. */
  let opening = false

  function cancel() {
    run += 1
    wait.value = null
    abort?.abort()
    abort = null
    // An object key the ended read still opens ends with the worker.
    if (opening) closeKeyWorker()
    opening = false
    wake?.()
  }

  /** Waits until `ready` holds or `ms` pass; a cancel ends the wait at once. */
  function until(ready: () => boolean, ms?: number): Promise<void> {
    return new Promise((resolve) => {
      const stop = watch(ready, (now) => now && finish())
      const timer = ms === undefined ? undefined : setTimeout(finish, ms)
      function finish() {
        stop()
        clearTimeout(timer)
        wake = null
        resolve()
      }
      wake = finish
      if (ready()) finish()
    })
  }

  /** The pinned version's bytes; throws `ReadEndedError` once a newer read or a cancel took over. */
  async function read(target: KeyedTarget): Promise<Blob> {
    cancel()
    const mine = run
    const epoch = sessionEpoch.value
    const ended = () => mine !== run || epoch !== sessionEpoch.value
    const check = () => {
      if (ended()) throw new ReadEndedError()
    }
    const file = `${target.bucket}\u0000${target.key}`
    try {
      const envelope = await fetchEnvelope(target)
      check()
      let grant = usableGrant(await ownGrants(target), envelope, target.key)
      check()
      if (!grant) {
        grant = await requestKey(target)
        check()
      }
      while (!grant || !usableGrant([grant], envelope, target.key)) {
        wait.value = 'pending'
        pending.value = new Set(pending.value).add(file)
        await until(ended, POLL_MS)
        check()
        grant = usableGrant(await ownGrants(target), envelope, target.key)
        check()
      }
      pending.value.delete(file)
      pending.value = new Set(pending.value)
      if (!vault.loaded.value) await vault.load()
      check()
      if (vault.state.value !== 'unlocked') {
        wait.value = 'vault'
        await until(() => ended() || vault.state.value === 'unlocked')
        check()
      }
      wait.value = null
      const userId = userInfo.value?.user.user_id
      if (!userId) throw new ReadEndedError()
      const open = vault.whileUnlocked()
      const guard = () => {
        check()
        if (!open()) throw new Error('Your personal vault closed during the read.')
      }
      const controller = new AbortController()
      abort = controller
      opening = true
      try {
        const blob = await readWithGrant(target, envelope, grant, userId, vault, guard, controller.signal)
        check()
        return blob
      } finally {
        if (mine === run) {
          opening = false
          abort = null
        }
      }
    } catch (cause) {
      if (!ended() && cause instanceof ReadWaitError) wait.value = cause.wait
      else if (!ended()) wait.value = null
      throw ended() ? new ReadEndedError() : cause
    }
  }

  /** Reads `object` after resolving its node API and pinned version. */
  async function readObject(object: KeyedObject): Promise<Blob> {
    const node = object.nodeId || localNodeId()
    const baseUrl = node ? nodeApiBase(node) : null
    if (!baseUrl) throw new Error('The node publishes no API address.')
    const versionId = object.versionId || (await useS3().headObject(object.bucket, object.key, object.nodeId)).versionId
    if (!versionId) throw new Error('The node named no version for this file.')
    return read({ bucket: object.bucket, key: object.key, versionId, client: { baseUrl, token: authToken.value } })
  }

  /** Saves `object` as `name`; false when the read waits or ended. Other failures are thrown. */
  async function save(object: KeyedObject, name: string): Promise<boolean> {
    try {
      saveBlob(await readObject(object), name)
      return true
    } catch (cause) {
      if (cause instanceof ReadEndedError || cause instanceof ReadWaitError) return false
      throw cause
    }
  }

  return { wait, pending, read, readObject, save, cancel }
}

/** Saves a read file under `name` through a short-lived blob URL. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
