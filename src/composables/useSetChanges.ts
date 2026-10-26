// The changes a group admin makes to a bucket stored on more nodes: add or remove a node, move a
// range, replace the settings, delete the bucket. The node that publishes the configuration takes
// each one; a blocked change answers 503 with a hint, which is shown as it is.
import { ref, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, type AdmissionResponse, type JoinMemberRequest, type SettingsBody, type TransferRangeRequest } from '@/lib/api'
import type { LiveState } from '@/lib/distribution'

export function useSetChanges(live: Ref<LiveState | undefined>) {
  const aruna = useAruna()
  const busy = ref(false)
  const failure = ref<string | null>(null)
  // The answer of an admission, which names the members that failed.
  const admission = ref<AdmissionResponse | null>(null)

  /** True when the node took the change. */
  async function run<T>(work: (where: { groupId: string; setId: string }) => Promise<T>): Promise<T | null> {
    if (!live.value || busy.value) return null
    busy.value = true
    failure.value = null
    admission.value = null
    try {
      return await work({ groupId: live.value.groupId, setId: live.value.setId })
    } catch (cause) {
      failure.value = apiErrorMessage(cause)
      return null
    } finally {
      busy.value = false
    }
  }

  return {
    busy,
    failure,
    admission,
    async join(body: JoinMemberRequest): Promise<boolean> {
      const answer = await run(({ groupId, setId }) => aruna.joinDistributedMember(groupId, setId, body))
      admission.value = answer
      // The member exists even when its admission stopped; the retry is in the Nodes tab.
      const refused = answer?.members.filter((member) => !member.admitted) ?? []
      if (answer?.error) failure.value = answer.error
      else if (refused.length) failure.value = refused.map((member) => member.error ?? 'A member is not admitted yet.').join(' ')
      return Boolean(answer)
    },
    async leave(memberId: string): Promise<boolean> {
      return Boolean(await run(({ groupId, setId }) => aruna.leaveDistributedMember(groupId, setId, memberId)))
    },
    async transfer(body: TransferRangeRequest): Promise<boolean> {
      return Boolean(await run(({ groupId, setId }) => aruna.transferDistributedRange(groupId, setId, body)))
    },
    async settings(body: SettingsBody): Promise<boolean> {
      return Boolean(await run(({ groupId, setId }) => aruna.changeDistributedSettings(groupId, setId, body)))
    },
    async remove(): Promise<boolean> {
      return Boolean(await run(({ groupId, setId }) => aruna.deleteDistributedBucket(groupId, setId)))
    },
  }
}
