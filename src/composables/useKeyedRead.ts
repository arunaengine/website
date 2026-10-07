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
import { sessionEpoch, userInfo } from './aruna/state'
import { useUserVault } from './useUserVault'

export const POLL_MS = 15_000

/** A newer read, a cancel or a session change ended this one. */
export class ReadEndedError extends Error {
  constructor() {
    super('The read was cancelled.')
    this.name = 'ReadEndedError'
  }
}

export function useKeyedRead() {
  const vault = useUserVault()
  /** What the current read waits for; `vault` asks the user to open their personal vault. */
  const wait = ref<ReadWait | 'vault' | null>(null)
  /** Files of this view whose read waits for a key, as `bucket` and `key` joined by a zero byte. */
  const pending = ref(new Set<string>())
  let run = 0
  let wake: (() => void) | null = null

  function cancel() {
    run += 1
    wait.value = null
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
      const blob = await readWithGrant(target, envelope, grant, userId, vault)
      check()
      return blob
    } catch (cause) {
      if (!ended() && cause instanceof ReadWaitError) wait.value = cause.wait
      else if (!ended()) wait.value = null
      throw ended() ? new ReadEndedError() : cause
    }
  }

  return { wait, pending, read, cancel }
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
